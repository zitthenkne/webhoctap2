// tao-benh-an.js — Trang viết bệnh án
import { showToast } from '../../core/utils.js';
import { applyGuide, guideOn, setGuide } from '../../core/guide.js';
import { getRecord, saveRecord, syncFromCloud, authReady } from './record-store.js';
import { initCls, getCls, setCls } from './cls-editor.js';
import { abnormalItems } from './cls-shared.js';
import { initHistory, getSteps, setSteps, calcOnset, buildProse, missingDetails, refreshSteps,
    syncMainSymFields, mainSymSlotCount, mainSymLabels, getClinicalContext,
    syncSeveritySlot, severityValue } from './benh-su-editor.js';
import { initBienLuan, getBienLuan, setBienLuan, buildProse as buildBienLuan, derivedDiagnosis, derivedClsDetail, syncFromProblems, listRedFlags, toggleRedFlag } from './bien-luan-editor.js';
import { createCnvList } from './cnv-list.js';
import { createBenhKemList } from './benh-kem-list.js';
import { createDoiList } from './doi-list.js';
import { initClsDeNghi } from './cls-de-nghi.js';
import { initLyDo } from './ly-do-list.js';
import { initPhanDo, getPhanDo, setPhanDo, refreshPhanDo, phanDoLines } from './phan-do.js';
import { initAmTinh, refreshAmTinh } from './am-tinh.js';
import { openSymptomPicker } from './symptom-picker.js';
import { createGiaDinhList } from './gia-dinh-list.js';
import { createDiUngList } from './di-ung-list.js';
import { XUONG_GAY, ML_PER_KG, tinhMauMat } from './chan-thuong-data.js';
import { THUOC_GROUPS, findThuoc, thuocTheoBenh, benhCuaThuoc } from './thuoc-data.js';
import { BENH_NHOM as BENH_GROUPS } from './benh-data.js';
import {
    DI_UNG_NHOM, DI_UNG_BIEU_HIEN, PHAU_THUAT_NHOM, QUAN_HE, THOI_QUEN,
    KINH_NGUYET, NGUA_THAI, KET_CUC_THAI
} from './tien-can-data.js';
import { BMI_TAGS, BP_STAGES } from './chi-so-chuan.js';
import { buildChips, buildPickers, NORMAL_EXAM, applyClinicalContext, labsCanCo } from './goi-y-nhap.js';
import { suggestStage, pastDiseases } from './muc-do-benh-kem.js';
import { initFindings } from './findings-editor.js';
import { getFolder, folderMeta } from './folder-store.js';
import { initFold, openSpec } from './ui-fold.js';
import { initAsk, getAsk, setAsk } from './ui-ask.js';
import { initTheoDoi, getTheoDoi, setTheoDoi } from './theo-doi-editor.js';
import { createImageBox } from './image-upload.js';
import { initRx, getRx, setRx, rxToText, addRx } from './rx-editor.js';
import { gradeAll, gradeToText } from './auto-grade.js';
import { validateRecord, summarize } from './clinical-validator.js';
import { buildNetwork, renderNetwork, redrawWires } from './lien-ket-map.js';
import { openListPicker } from './list-picker.js';
import { fold } from './tim-kiem.js';
import { VAN_DE_NHOM } from './bien-luan-data.js';

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
    'benhSuChiTiet.anUong': 'hx-eat',
    'benhSuChiTiet.giacNgu': 'hx-sleep',
    'benhSuChiTiet.tieu': 'hx-stool',
    'benhSuChiTiet.tieuTien': 'hx-urine',
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
    'tienSu.phoiNhiem.ngheNghiep': 'env-job',
    'tienSu.phoiNhiem.vungDich': 'env-area',
    'tienSu.phoiNhiem.nguoiBenh': 'env-contact',
    'tienSu.phoiNhiem.dongVat': 'env-animal',
    'tienSu.phoiNhiem.nuocAn': 'env-water',
    'tienSu.phoiNhiem.diLai': 'env-travel',
    'tienSu.ngoaiKhoa': 'history-surgery',
    'tienSu.sanPhuKhoa': 'history-obgyne',
    'tienSu.diUng': 'history-allergy',
    'tienSu.moiTruong': 'history-environment',
    'tienSu.thuocDangDung': 'history-drugs',
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
    'tienSu.kinhNguyet.tuoiCoKinh': 'ob-menarche',
    'tienSu.kinhNguyet.chuKy': 'ob-cycle-type',
    'tienSu.kinhNguyet.soNgay': 'ob-days',
    'tienSu.kinhNguyet.luong': 'ob-amount',
    'tienSu.kinhNguyet.dauBung': 'ob-dysmenorrhea',
    'tienSu.kinhNguyet.nguaThai': 'ob-contraception',
    'benhSuChiTiet.san.soLanKhamThai': 'ob-hx-visits',
    'benhSuChiTiet.san.noiKhamThai': 'ob-hx-where',
    'benhSuChiTiet.san.sieuAm': 'ob-hx-us',
    'benhSuChiTiet.san.xetNghiem': 'ob-hx-tests',
    'benhSuChiTiet.san.uonVan': 'ob-hx-vat',
    'benhSuChiTiet.san.batThuong': 'ob-hx-abnormal',
    'benhSuChiTiet.san.canTruocMangThai': 'ob-hx-preweight',
    'benhSuChiTiet.san.canHienTai': 'ob-hx-nowweight',
    'benhSuChiTiet.nhi.nguoiNuoi': 'ped-hx-who',
    'benhSuChiTiet.nhi.anBu': 'ped-hx-feed',
    'benhSuChiTiet.nhi.nuocTieu': 'ped-hx-urine',
    'benhSuChiTiet.nhi.phan': 'ped-hx-stool',
    'benhSuChiTiet.nhi.dichTe': 'ped-hx-epi',
    'benhSuChiTiet.nhi.daDieuTri': 'ped-hx-treated',
    'benhSuChiTiet.nhi.canTruocBenh': 'ped-hx-preweight',
    'tienSu.truocMo.gayMe': 'sx-hx-anes',
    'tienSu.truocMo.chongDong': 'sx-hx-anticoag',
    'tienSu.truocMo.anUong': 'sx-hx-fasting',
    'tienSu.truocMo.rangGia': 'sx-hx-teeth',
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
    setPath(rec, 'chanThuong.xuongGay', gayXuong.filter(x => x.ten));
    setPath(rec, 'chanThuong.bongVung', burnGet());
    setPath(rec, 'tienSu.giaDinhChiTiet', dsGiaDinh ? dsGiaDinh.get() : []);
    setPath(rec, 'tienSu.diUngChiTiet', dsDiUng ? dsDiUng.get() : []);
    rec.hoiCo = getAsk();
    rec.phanDo = getPhanDo();
    return rec;
}

function fillForm(rec) {
    if (rec.status) $('record-status').value = rec.status;
    refreshSettingsSummary?.();
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
    dsGiaDinh?.set(rec.tienSu?.giaDinhChiTiet);   // không có thì tự đọc ngược từ dòng chữ cũ
    dsDiUng?.set(rec.tienSu?.diUngChiTiet);
    gayXuong = rec.chanThuong?.xuongGay || [];
    gxRender();
    burnSet(rec.chanThuong?.bongVung);   // calcTrauma() chạy sau, ở loadExisting -> calcSpecialty()
    setAsk(rec.hoiCo);
    setPhanDo(rec.phanDo);
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
/* Điện thoại: hai tab này dài hơn 8000px nếu mở hết. Gập sẵn, chừa mục đầu đang
   làm dở — muốn xem mục nào thì chạm tiêu đề mục đó (badge % cho biết còn thiếu). */
const smallScreen = window.matchMedia('(max-width: 640px)').matches;
['#kham-benh', '#lydo-tiensu'].forEach(tab => {
    document.querySelectorAll(`${tab} > fieldset`)
        .forEach((fs, i) => makeCollapsible(fs, smallScreen && i > 0));
});

/* Ô nằm trong vùng data-nocount nhưng VẪN phải tính vào tiến độ. Không thể bỏ
   data-nocount của cả vùng: phiếu cận lâm sàng in sẵn tên chỉ số và đơn vị, mỗi
   lần theo dõi chép sẵn sinh hiệu lần trước — đếm hết thì % tự nhảy lên mà chưa
   ai điền gì. Chỉ nhặt đúng những ô người viết phải tự điền. */
const DEM_THEM = [
    '#cls-list .cls-in-val',              // kết quả của từng chỉ số trong phiếu
    '#td-list .td-in',                    // diễn tiến + xử trí của mỗi lần theo dõi
    '#hx-main-box > .hx-grid .calc-in'    // 8 thuộc tính triệu chứng chính (khối này bị dời vào #hx-list)
].join(', ');

/** Đếm ô đã điền trong một vùng (bỏ ô ẩn, ô chỉ đọc, ô có sẵn giá trị mặc định) */
function countFilled(root) {
    const els = [...root.querySelectorAll('input:not([type=hidden]):not([readonly]), textarea, select')]
        .filter(el => !el.closest('.sticky-actions') && !el.closest('[data-nocount]'));
    els.push(...root.querySelectorAll(DEM_THEM));
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
        local: '<i class="fas fa-hdd text-amber-400"></i>',
        error: '<i class="fas fa-triangle-exclamation text-red-500"></i>'
    };
    el.innerHTML = (icons[state] || '') + ' <span>' + text + '</span>';
}

/* Ghi hỏng (bộ nhớ trình duyệt đầy, quota…) thì phải nói ra: trước đây lỗi ném ra
   ngoài, `dirty` không bao giờ về false, thanh trạng thái kẹt ở "Đang lưu…" nên
   người viết tưởng đã lưu xong. Nay giữ `dirty` để lần gõ sau tự thử lại, báo đỏ
   ngay trên thanh, và chỉ nhắc bằng toast MỘT lần cho mỗi đợt hỏng.
   Trả về null khi hỏng — nơi nào định rời trang sau khi lưu thì đừng rời. */
let saveLoi = false;

async function doSave({ silent = true, force = false } = {}) {
    if (!dirty && !force) return getRecord(recordId);
    setSaveState('saving', 'Đang lưu…');
    const rec = collectRecord();
    try {
        const res = await saveRecord(rec);
        dirty = false;
        saveLoi = false;
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setSaveState(res.cloud ? 'saved' : 'local',
            res.cloud ? `Đã lưu ${time}` : `Đã lưu trên máy ${time}`);
        if (!silent) showToast('Đã lưu bệnh án.', 'success');
        return rec;
    } catch (err) {
        console.warn('Lưu bệnh án lỗi:', err);
        setSaveState('error', 'CHƯA LƯU ĐƯỢC — đừng đóng tab');
        if (!saveLoi || !silent) {
            showToast('Chưa lưu được bệnh án. Bộ nhớ trình duyệt có thể đã đầy — '
                + 'xóa bớt bệnh án cũ hoặc xuất file sao lưu, rồi bấm “Lưu bệnh án”.', 'error', 8000);
        }
        saveLoi = true;
        return null;
    }
}

function scheduleSave() {
    if (!dirty) setSaveState('saving', 'Đang soạn…');
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => doSave(), 1200);
    scheduleValidate();
}

/* =====================================================================
   3b. RÀ SOÁT LOGIC LÂM SÀNG
   Mọi thay đổi trên form (kể cả trong các editor con, vì chúng đều gọi
   scheduleSave) đều hẹn giờ 400ms rồi chạy lại toàn bộ bộ luật.
   ===================================================================== */
let liTimer, liAlerts = [];

function scheduleValidate() {
    clearTimeout(liTimer);
    liTimer = setTimeout(runClinicalValidation, 400);
}

function runClinicalValidation() {
    try {
        liAlerts = validateRecord({ bienLuan: getBienLuan(), rx: getRx() });
    } catch (err) {
        console.warn('Rà soát logic lỗi:', err);
        liAlerts = [];
    }
    renderLogicInspector();
}

const liEsc = (x) => String(x ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEV_ICON = { HIGH: 'fa-circle-exclamation', MEDIUM: 'fa-triangle-exclamation', LOW: 'fa-lightbulb' };
const LEVEL_LABEL = { green: 'Có thể bổ sung', amber: 'Cần bổ sung', red: 'Có xung đột logic' };

function renderLogicInspector() {
    const bar = $('logic-inspector-bar');
    const box = $('logic-alerts-container');
    if (!bar || !box) return;

    const sum = summarize(liAlerts);
    const net = renderNetBrief();
    // Bệnh án sạch cả luật lẫn liên kết thì giấu hẳn viên đèn
    if (!sum.total && !net) {
        bar.classList.add('is-hidden');
        bar.classList.remove('is-open');
        markFlaggedFields();
        return;
    }
    bar.classList.remove('is-hidden');
    bar.dataset.level = sum.total ? sum.level : 'amber';
    $('li-label').textContent = sum.total ? LEVEL_LABEL[sum.level] : 'Còn chỗ chưa nối';
    $('li-count').textContent = sum.total || net;
    if ($('li-n-logic')) $('li-n-logic').textContent = sum.total;
    if ($('li-n-net')) $('li-n-net').textContent = net;

    box.innerHTML = liAlerts.length ? liAlerts.map((a, i) => `
        <div class="li-card sev-${a.severity}" data-i="${i}">
            <div class="li-t"><i class="fas ${SEV_ICON[a.severity]}"></i> ${liEsc(a.title)}</div>
            <div class="li-m">${liEsc(a.message)}</div>
            <div class="li-acts">
                ${a.targetField ? `<button type="button" data-go="${i}"><i class="fas fa-location-arrow"></i> Đi tới ô này</button>` : ''}
                ${a.autoFix ? `<button type="button" class="li-fix" data-fix="${i}"><i class="fas fa-wand-magic-sparkles"></i> Bổ sung nhanh</button>` : ''}
                ${a.actionText && !a.autoFix ? `<span class="li-m">${liEsc(a.actionText)}</span>` : ''}
            </div>
        </div>`).join('')
        : `<p class="li-empty"><i class="fas fa-circle-check"></i>Xong hết rồi!<br>
            <small>Máy vẫn rà lại mỗi khi bạn sửa bệnh án.</small></p>`;

    markFlaggedFields();
}

/* Viền màu ngay tại ô đang bị cảnh báo — chỉ tô, không chặn gõ */
function markFlaggedFields() {
    document.querySelectorAll('.li-flag').forEach(el => el.classList.remove('li-flag', 'li-flag-amber'));
    liAlerts.filter(a => a.severity !== 'LOW' && a.targetField).forEach(a => {
        const el = $(a.targetField);
        if (!el) return;
        el.classList.add('li-flag');
        if (a.severity === 'MEDIUM') el.classList.add('li-flag-amber');
    });
}

/* =====================================================================
   3c. MẠNG LƯỚI LIÊN KẾT — dữ kiện → vấn đề → chẩn đoán → CLS → điều trị
   Bảng nhỏ chỉ liệt kê chỗ đứt; bấm "Mở bản đồ" mới vẽ cả mạng ra.
   ===================================================================== */
let netModel = { nodes: [], edges: [], breaks: [] };

/* Cùng một lỗi thì chỉ được báo ở MỘT chỗ, không thì hai tab của cùng một bảng đếm
   hai con số cho cùng một chuyện. Chỗ nào nói kỹ hơn thì chỗ đó giữ:
   · "chưa tạo thẻ biện luận" -> luật MISSING_BRANCH ở tab Logic (có nút bổ sung nhanh)
   · "chưa gắn mục đích"      -> ngay trên dòng đề nghị ở mục XI (sửa được tại chỗ)
   Node vẫn mang cảnh báo trên bản đồ, chỉ không liệt kê lại ở danh sách chỗ đứt. */
const netTrungChoKhac = (b) => {
    const w = String(b.warn || '');
    if (w.startsWith('chưa gắn mục đích')) return true;
    return w.startsWith('chưa tạo thẻ biện luận')
        && liAlerts.some(a => a.type === 'MISSING_BRANCH');
};

/** Vẽ tóm tắt liên kết vào bảng nổi, trả về số chỗ đứt */
function renderNetBrief() {
    const box = $('net-brief');
    if (!box) return 0;
    try {
        netModel = buildNetwork();
    } catch (err) {
        console.warn('Dựng mạng liên kết lỗi:', err);
        netModel = { nodes: [], edges: [], breaks: [] };
    }
    const { nodes, edges } = netModel;
    const breaks = netModel.breaks.filter(b => !netTrungChoKhac(b));
    box.innerHTML = `<p class="net-sum"><b>${nodes.length}</b> mảnh thông tin ·
        <b>${edges.length}</b> mối nối · <b>${breaks.length}</b> chỗ đứt</p>
        ${breaks.slice(0, 8).map((b, i) => `<button type="button" class="net-break" data-b="${i}">
            <i class="fas fa-link-slash"></i>
            <span><b>${liEsc(b.text)}</b>${liEsc(b.warn)}</span></button>`).join('')}
        ${breaks.length > 8 ? `<p class="net-sum">… và ${breaks.length - 8} chỗ nữa</p>` : ''}
        ${!breaks.length && nodes.length ? `<p class="li-empty"><i class="fas fa-circle-check"></i>
            Mọi thứ đều đã nối vào nhau.</p>` : ''}
        <button type="button" class="net-open" id="net-open"><i class="fas fa-circle-nodes"></i>
            Mở bản đồ mạng lưới</button>`;
    return breaks.length;
}

/** Bản đồ toàn màn hình — có dây nối thật, rê chuột để soi một nhánh */
function openNetOverlay() {
    const host = $('net-host');
    const ov = $('net-overlay');
    if (!host || !ov) return;
    renderNetwork(host, buildNetwork(), (tab, field) => {
        ov.classList.add('hidden');
        gotoAlert({ targetTab: tab, targetField: field });
    });
    ov.classList.remove('hidden');
    requestAnimationFrame(() => redrawWires(host));   // chờ layout xong mới đo được toạ độ
}

$('net-brief')?.addEventListener('click', (e) => {
    if (e.target.closest('#net-open')) return openNetOverlay();
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const hien = netModel.breaks.filter(x => !netTrungChoKhac(x))[+b.dataset.b];
    if (hien) gotoAlert({ targetTab: hien.tab, targetField: hien.field });
});
$('net-close')?.addEventListener('click', () => $('net-overlay').classList.add('hidden'));
window.addEventListener('resize', () => {
    if (!$('net-overlay')?.classList.contains('hidden')) redrawWires($('net-host'));
});

/* Hai thẻ trong bảng nổi: luật lâm sàng và mạng lưới liên kết */
document.querySelectorAll('.li-tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.li-tabs button').forEach(x => x.classList.toggle('is-on', x === b));
    const net = b.dataset.view === 'net';
    $('logic-alerts-container').hidden = net;
    $('net-brief').hidden = !net;
}));

/** Nhảy tới đúng tab + ô của một cảnh báo */
function gotoAlert(a) {
    if (a.targetTab) showTab(a.targetTab);
    const el = $(a.targetField);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus?.({ preventScroll: true });
}

/** "Bổ sung nhanh": điền sẵn phần còn thiếu thay vì bắt gõ lại */
function applyAutoFix(a) {
    const fx = a.autoFix || {};
    if (fx.redFlags) {
        fx.redFlags.forEach(t => { if (!listRedFlags().includes(t)) toggleRedFlag(t); });
        showToast(`Đã thêm ${fx.redFlags.length} bệnh cảnh vào "cần loại trừ khẩn".`, 'success');
    } else if (fx.syncProblems) {
        const n = syncFromProblems();
        showToast(n ? `Đã tạo ${n} thẻ biện luận.` : 'Không có vấn đề mới để tạo.', n ? 'success' : 'warning');
    } else if (fx.targetField) {
        const el = $(fx.targetField);
        if (!el) return;
        if (fx.setValue) el.value = fx.setValue;
        else {
            const co = el.value.split('\n').map(x => x.trim()).filter(Boolean);
            fx.appendValue.split('\n').map(x => x.trim()).filter(Boolean)
                .forEach(x => { if (!co.some(y => y.toLowerCase() === x.toLowerCase())) co.push(x); });
            el.value = co.join('\n');
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        autoGrow(el);
        showToast('Đã bổ sung vào bệnh án — đọc lại và sửa cho khớp ca bệnh.', 'success');
    }
    updateProgress();
    scheduleSave();
}

$('li-toggle')?.addEventListener('click', () => $('logic-inspector-bar').classList.toggle('is-open'));
$('li-close')?.addEventListener('click', () => $('logic-inspector-bar').classList.remove('is-open'));
$('logic-alerts-container')?.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) return gotoAlert(liAlerts[+go.dataset.go]);
    const fix = e.target.closest('[data-fix]');
    if (fix) applyAutoFix(liAlerts[+fix.dataset.fix]);
});

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

/* Đọc "114/70" — trước đây bốn chỗ mỗi chỗ chép lại một bản regex riêng */
function docHuyetAp(v) {
    const m = String(v || '').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    return m ? { sys: +m[1], dia: +m[2] } : null;
}
/* Tụt huyết áp theo định nghĩa chung. Lưu ý CURB-65 KHÔNG dùng hàm này: tiêu chuẩn
   của thang đó là HATTr ≤ 60 (chứ không phải < 60), cố ý để khác — xem calcScores. */
const tutHuyetAp = (bp) => !!bp && (bp.sys < 90 || bp.dia < 60);

/* Huyết áp: máy tự tính huyết áp trung bình, hiệu áp và phân độ THA.
   Dùng chung cho sinh hiệu lúc khám và sinh hiệu lúc nhập viện. */
function calcBp(oId = 'vital-bp', tagId = 'bp-tag') {
    const tag = $(tagId);
    if (!tag) return;
    const bp = docHuyetAp($(oId)?.value);
    if (!bp) { tag.textContent = ''; return; }
    const { sys, dia } = bp;
    const map = Math.round((sys + 2 * dia) / 3);
    const stage = tutHuyetAp(bp) ? BP_STAGES[0]
        : (BP_STAGES.find(([s, d]) => sys < s && dia < d) || BP_STAGES.at(-1));
    tag.textContent = `HATB ${map} mmHg · Hiệu áp ${sys - dia} · ${stage[2]}`;
    tag.className = 'text-xs font-semibold mt-1 block ' + stage[3];
}
const calcBpAll = () => { calcBp(); calcBp('adm-bp', 'adm-bp-tag'); };

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
    const bp = docHuyetAp($('vital-bp').value);
    const ure = getCls().flatMap(c => c.items || []).find(i => /^ure$/i.test(i.n));
    const ureVal = ure ? parseFloat(String(ure.v).replace(',', '.')) : NaN;
    const confusion = $('curb-confusion').value === 'Có' || (gcs != null && gcs < 15);

    const hit = [], missing = [];
    if (confusion) hit.push('rối loạn tri giác');
    else if (!$('curb-confusion').value && gcs == null) missing.push('tri giác');

    if (!isNaN(ureVal)) { if (ureVal > 7) hit.push('ure > 7'); } else missing.push('ure máu');
    if (!isNaN(resp)) { if (resp >= 30) hit.push('nhịp thở ≥ 30'); } else missing.push('nhịp thở');
    // Tiêu chuẩn của CURB-65 là HATT < 90 HOẶC HATTr ≤ 60 — khác định nghĩa tụt huyết áp chung
    if (bp) { if (bp.sys < 90 || bp.dia <= 60) hit.push('tụt huyết áp'); } else missing.push('huyết áp');
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
    // Bộ câu hỏi đổi theo triệu chứng nên số ô cũng đổi — chấm theo số ô đang hiện
    const symSlots = mainSymSlotCount();
    const symAttrs = ['hx-sym-site', 'hx-sym-char', 'hx-sym-severity', 'hx-sym-time',
        'hx-sym-factors', 'hx-sym-assoc'].filter(id => v(id)).length;
    const items = [
        ['Người khai bệnh', !!v('hx-informant')],
        ['Ngày khởi phát', !!v('hx-onset-date')],
        [`Diễn tiến ≥ 2 mốc (${steps.length})`, steps.length >= 2],
        [`Triệu chứng chính đủ thuộc tính (${symAttrs}/${symSlots})`,
            !!v('hx-sym-name') && symAttrs >= Math.max(2, Math.ceil(symSlots * 2 / 3))],
        ['Toàn thân trong quá trình bệnh', !!v('hx-general')],
        ['Triệu chứng âm tính', !!v('hx-negatives')],
        ['Tình trạng lúc nhập viện', !!v('hx-admit-state')],
        ['Sinh hiệu lúc nhập viện', ['adm-pulse', 'adm-bp', 'adm-temp', 'adm-resp'].some(id => v(id))]
    ];
    const done = items.filter(([, ok]) => ok).length;
    const miss = items.filter(([, ok]) => !ok).map(([label]) => label);

    /* Trên điện thoại, hộp nhắc việc dài hơn cả phần nhập. Gom thành MỘT dòng:
       đủ ý mấy phần, còn thiếu gì — bấm mới bung chi tiết ra. */
    const rd = radarData();
    const tomTat = [
        miss.length ? `${miss.length} mục chưa đủ` : 'đã đủ ý',
        rd.holes.length ? `${rd.holes.length} thuộc tính trống` : '',
        rd.negN ? `${rd.negN} âm tính` : 'chưa có âm tính',
        rd.flags.length ? `${rd.flags.length} cần loại trừ` : ''
    ].filter(Boolean).join(' · ');

    box.innerHTML = `<details class="hx-fold"${hxOpen ? ' open' : ''}>
        <summary>
            <span class="hx-score"><i class="fas fa-clipboard-check"></i> Đủ ý ${done}/${items.length}
                <span class="hx-bar"><i style="width:${Math.round(done / items.length * 100)}%"></i></span></span>
            <span class="hx-sum">${tomTat}</span>
            <i class="fas fa-chevron-down caret"></i>
        </summary>
        <div class="hx-fold-body">
            ${miss.length
            ? `<div class="hx-row"><b class="hx-rowlab"><i class="fas fa-list-check"></i> Còn thiếu</b>
                    ${miss.map(l => `<span class="hx-chk">${l}</span>`).join('')}</div>`
            : `<div class="hx-row"><span class="hx-done"><i class="fas fa-circle-check"></i> Đã đủ ý — đọc lại một lượt là xong</span></div>`}
            ${radarHtml(rd)}
        </div>
    </details>`;
    box.querySelector('details')?.addEventListener('toggle', (e) => { hxOpen = e.target.open; });

    // Bệnh cảnh vừa đổi thì tab khám, lược qua cơ quan và bảng phân độ chỉnh lại cho trúng
    applyClinicalContext(getClinicalContext());
    refreshPhanDo();
    syncSeveritySlot();     // thang một-câu-hỏi nằm ngay ở ô "Mức độ", đổi bệnh cảnh là đổi theo
    refreshAmTinh();
}

/* Rà soát bỏ sót: thuộc tính triệu chứng chính còn trống, số triệu chứng âm tính
   có giá trị, và các bệnh cảnh nguy hiểm phải loại trừ của bệnh cảnh đang khai thác. */
let hxOpen = false;      // nhớ trạng thái bung của hộp nhắc việc giữa các lần vẽ lại

function radarData() {
    const v = (id) => ($(id)?.value || '').trim();
    return {
        holes: v('hx-sym-name') ? mainSymLabels().filter(x => x.on && !v(x.id)).map(x => x.label) : [],
        negN: v('hx-negatives').split(/[,;]/).filter(x => x.trim()).length,
        flags: [...new Set(getClinicalContext().flatMap(s => s.redFlags || []))].slice(0, 6)
    };
}

function radarHtml(rd) {
    const { holes, negN, flags } = rd || radarData();
    const already = listRedFlags();

    const rows = [];
    if (holes.length) {
        rows.push(`<div class="hx-row"><b class="hx-rowlab"><i class="fas fa-list-check"></i> Chưa khai thác</b>
            ${holes.map(l => `<span class="hx-chk is-hole">${l}</span>`).join('')}</div>`);
    }
    rows.push(`<div class="hx-row"><b class="hx-rowlab"><i class="fas fa-circle-minus"></i> Âm tính có giá trị</b>
        <span class="hx-chk ${negN ? 'is-ok' : 'is-hole'}">${negN
            ? `${negN} triệu chứng — dùng để biện luận phân biệt`
            : 'chưa có — bấm “Khai thác đủ ý” rồi tick phần âm tính'}</span></div>`);
    if (flags.length) {
        rows.push(`<div class="hx-row"><b class="hx-rowlab warn"><i class="fas fa-triangle-exclamation"></i> Đã loại trừ chưa?</b>
            ${flags.map(f => `<button type="button" class="hx-rf${already.includes(f) ? ' is-on' : ''}" data-rf="${f.replace(/"/g, '&quot;')}">
                <i class="${already.includes(f) ? 'fa-solid fa-square-check' : 'fa-regular fa-square'}"></i> ${f}</button>`).join('')}
            <span class="hx-rfhint">tick là đưa thẳng vào “cần loại trừ khẩn” ở mục X</span></div>`);
    }
    return rows.join('');
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
    const bp = docHuyetAp($('vital-bp').value);
    const e = parseInt($('gcs-e')?.value), v = parseInt($('gcs-v')?.value), m = parseInt($('gcs-m')?.value);
    const gcs = (e && v && m) ? e + v + m : null;
    const hit = [], miss = [];
    if (!isNaN(resp)) { if (resp >= 22) hit.push('nhịp thở ≥ 22'); } else miss.push('nhịp thở');
    if (bp) { if (bp.sys <= 100) hit.push('HA tâm thu ≤ 100'); } else miss.push('huyết áp');
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

/* Vùng bỏng đã tick: lưu theo data-vung chứ không theo thứ tự ô — nhiều vùng trùng
   data-pct (9% và 18% mỗi thứ mấy vùng) nên phần trăm không dùng làm khóa được. */
function burnGet() {
    return [...document.querySelectorAll('.burn-area:checked')].map(el => el.dataset.vung);
}
function burnSet(list) {
    const co = new Set(list || []);
    document.querySelectorAll('.burn-area').forEach(el => { el.checked = co.has(el.dataset.vung); });
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
            parts.push(`bù dịch Parkland ${ml} mL/24h`
                + ` — 8 giờ đầu ${Math.round(ml / 2)} mL (~${Math.round(ml / 16)} mL/giờ),`
                + ` 16 giờ sau ${Math.round(ml / 2)} mL (~${Math.round(ml / 32)} mL/giờ)`);
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
    const co = [v('tr-energy'), v('tr-impact') && 'va đập đầu tiên vào ' + v('tr-impact'),
    v('tr-object') && 'vật gây thương tích là ' + v('tr-object'), v('tr-protect')].filter(Boolean);
    lines.push(`Bệnh nhân bị ${(v('tr-type') || 'chấn thương').toLowerCase()}${when ? ' ' + when : ''}`
        + (co.length ? `, cơ chế ${co.join(', ')}` : '') + '.');

    const sau = [v('tr-loc'), v('tr-amnesia'), v('tr-vomit'), v('tr-walk')].filter(Boolean);
    if (sau.length) lines.push(`Sau tai nạn, bệnh nhân ${sau.join(', ').toLowerCase()}.`);

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
    const row = (g) => `<div class="grade-row ${g.muc || ''}">
            <span class="grade-dot"></span>
            <span class="grade-name">${g.ten}</span>
            <span class="grade-val">${g.ketQua}
                ${g.dua ? `<span class="grade-src">dựa vào: ${g.dua}</span>` : ''}
                ${g.thieu ? `<span class="grade-src">còn thiếu: ${g.thieu}</span>` : ''}</span>
        </div>`;
    // Thang chưa đủ dữ liệu thì gói lại một dòng — bày ra chỉ tổ rối, nhất là trên điện thoại
    const cham = lastGrades.filter(g => g.muc);
    const chua = lastGrades.filter(g => !g.muc);
    box.innerHTML = (cham.length ? cham.map(row).join('') : '')
        + (chua.length ? `<details class="grade-more">
                <summary>${cham.length ? `Còn ${chua.length} thang chưa đủ dữ liệu` : `${chua.length} thang đang chờ dữ liệu — nhập sinh hiệu / cận lâm sàng là máy chấm`}</summary>
                ${chua.map(row).join('')}</details>` : '')
        + (!lastGrades.length ? '<p class="grade-empty">Nhập sinh hiệu hoặc kết quả cận lâm sàng, máy sẽ tự chấm độ cho bạn.</p>' : '');
}

/* Tăng cân thai kỳ — đối chiếu khuyến nghị theo BMI trước mang thai (IOM) */
const GAIN_IOM = [
    [18.5, 12.5, 18, 'gầy (BMI < 18,5)'],
    [25, 11.5, 16, 'bình thường (BMI 18,5 – 24,9)'],
    [30, 7, 11.5, 'thừa cân (BMI 25 – 29,9)'],
    [Infinity, 5, 9, 'béo phì (BMI ≥ 30)']
];
function calcThaiGain() {
    const out = $('ob-gain-out');
    if (!out) return;
    const truoc = parseFloat($('ob-hx-preweight')?.value);
    const nay = parseFloat($('ob-hx-nowweight')?.value);
    const cm = parseFloat($('vital-height')?.value);
    if (!(truoc > 0) || !(nay > 0)) {
        out.textContent = 'Nhập cân nặng trước và hiện tại để máy chấm mức tăng cân thai kỳ';
        out.parentElement.classList.remove('is-warn');
        return;
    }
    const tang = +(nay - truoc).toFixed(1);
    const bits = [`Tăng ${String(tang).replace('.', ',')} kg trong thai kỳ`];
    let warn = false;
    if (cm > 0) {
        const bmi = truoc / Math.pow(cm / 100, 2);
        const [, lo, hi, nhom] = GAIN_IOM.find(([max]) => bmi < max);
        const nx = tang < lo ? 'tăng ít hơn khuyến nghị'
            : tang > hi ? 'tăng nhiều hơn khuyến nghị' : 'trong khoảng khuyến nghị';
        warn = tang < lo || tang > hi;
        bits.push(`BMI trước mang thai ${bmi.toFixed(1)} — ${nhom}`,
            `khuyến nghị tăng ${String(lo).replace('.', ',')} – ${String(hi).replace('.', ',')} kg`,
            nx);
    } else {
        bits.push('nhập chiều cao ở phần sinh hiệu để đối chiếu khuyến nghị');
    }
    out.textContent = bits.join(' · ');
    out.parentElement.classList.toggle('is-warn', warn);
}

/* Mất nước ở trẻ — tính từ phần trăm cân nặng sụt so với lúc chưa bệnh */
function calcMatNuoc() {
    const out = $('ped-dehyd-out');
    if (!out) return;
    const truoc = parseFloat($('ped-hx-preweight')?.value);
    const nay = parseFloat($('vital-weight')?.value);
    if (!(truoc > 0) || !(nay > 0) || nay > truoc) {
        out.textContent = 'Nhập cân trước khi bệnh và cân hiện tại (phần sinh hiệu) để chấm mức mất nước';
        out.parentElement.classList.remove('is-warn');
        return;
    }
    const mat = truoc - nay;
    // Phân độ theo đúng con số hiện ra, kẻo 9,999% in thành "10,0%" mà vẫn xếp mức nhẹ hơn
    const pct = Math.round((mat / truoc) * 1000) / 10;
    const muc = pct < 5 ? ['nhẹ', 'bù dịch đường uống (kế hoạch A)']
        : pct < 10 ? ['trung bình', 'bù dịch đường uống có giám sát (kế hoạch B)']
            : ['nặng', 'bù dịch đường tĩnh mạch ngay (kế hoạch C)'];
    out.textContent = `Sụt ${mat.toFixed(1).replace('.', ',')} kg (~${String(pct).replace('.', ',')}% cân nặng)`
        + ` · mất nước mức ${muc[0]} · ${muc[1]}`;
    out.parentElement.classList.toggle('is-warn', pct >= 10);
}

function calcSpecialty() {
    calcObstetric(); calcPediatric(); calcSurgery(); calcQsofa(); calcTrauma();
    calcThaiGain(); calcMatNuoc(); renderGrades();
}

function syncGenderUi() {
    // Ba trạng thái: nữ · nam · chưa chọn. Chưa chọn thì cứ bày ra, đừng đoán
    // giùm bệnh nhân — trước đây mặc định "Nam" nên mục sản khoa tự mờ đi.
    const g = $('patient-gender').value;
    const box = $('obgyne-box');
    if (!box) return;
    box.classList.toggle('is-female', g === 'Nữ');
    box.classList.toggle('is-male', g === 'Nam');
    $('obgyne-flag')?.classList.toggle('hidden', g !== 'Nữ');
}

// Cảnh báo sinh hiệu bất thường (viền cam, không chặn nhập)
/* [thấp, cao, đơn vị, gọi tên khi thấp, gọi tên khi cao] — người lớn */
const RANGE = {
    pulse: [60, 100, 'l/p', 'mạch chậm', 'mạch nhanh'],
    temp: [36, 37.5, '°C', 'hạ thân nhiệt', 'sốt'],
    resp: [12, 20, 'l/p', 'thở chậm', 'thở nhanh'],
    spo2: [95, 100, '%', 'giảm oxy máu', '']
};
const VITAL_RANGE = Object.fromEntries(
    Object.entries(RANGE).flatMap(([k, r]) => [[`vital-${k}`, r], [`adm-${k}`, r]]));

/* Ô sinh hiệu tự nói ngưỡng bình thường khi còn trống, và gọi tên bất thường khi đã nhập —
   sinh viên khỏi phải nhớ ngưỡng, cũng khỏi bỏ sót một con số bất thường. */
function flagVital(el) {
    const r = VITAL_RANGE[el.id];
    if (!r) return;
    const v = parseFloat(el.value);
    const low = !isNaN(v) && v < r[0];
    const high = !isNaN(v) && v > r[1] && !!r[4];
    el.classList.toggle('vital-warn', low || high);
    const tag = $('vt-' + el.id);
    if (!tag) return;
    // Tiếng Việt dùng dấu phẩy thập phân, cho khớp với con số người dùng gõ vào
    const num = (x) => String(x).replace('.', ',');
    const bt = `bình thường ${num(r[0])}–${num(r[1])} ${r[2]}`;
    tag.textContent = isNaN(v) ? bt
        : low ? `${r[3].charAt(0).toUpperCase() + r[3].slice(1)} — ${bt}`
            : high ? `${r[4].charAt(0).toUpperCase() + r[4].slice(1)} — ${bt}`
                : 'Trong giới hạn bình thường';
    tag.className = 'vt-tag ' + (low || high ? 'is-warn' : isNaN(v) ? 'is-hint' : 'is-ok');
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

    lines.push('', 'Qua hỏi bệnh sử, tiền căn, thăm khám lâm sàng và các cận lâm sàng đã có, ghi nhận');

    let n = 0;
    // Tóm tắt trình bày theo số thứ tự cho dễ theo dõi, nhưng nối bằng gạch "—"
    // chứ không phải dấu hai chấm — đọc lên vẫn xuôi như một câu.
    const group = (title, body) => { if (body) lines.push(`${++n}. ${title} — ${body}`); };

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
        .map(([k, val]) => `${k} ${val}`).join('; ');
    group('Tiền căn', history);

    if (v('provisional-diagnosis')) lines.push('', '→ Chẩn đoán sơ bộ ' + v('provisional-diagnosis'));
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
    const bp = docHuyetAp(v('vital-bp'));
    if (bp && (bp.sys >= 140 || bp.dia >= 90)) add('Tăng huyết áp');
    if (tutHuyetAp(bp)) add('Tụt huyết áp');
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

/* Ô sinh ra sau (mốc bệnh sử, y lệnh, phiếu CLS, lần theo dõi…) cũng cần phím
   Enter = "ô kế". Trước đây quét lại cả form (~400 ô) mỗi khung hình lúc đếm tiến
   độ; nay chỉ chạm vào đúng cụm vừa được thêm vào DOM. */
const O_MOI = 'input:not([type=hidden]):not([enterkeyhint])';
function datEnterKey(node) {
    if (node.nodeType !== 1) return;
    if (node.matches?.(O_MOI)) node.setAttribute('enterkeyhint', 'next');
    node.querySelectorAll?.(O_MOI).forEach(el => el.setAttribute('enterkeyhint', 'next'));
}
new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(datEnterKey)))
    .observe(form, { childList: true, subtree: true });
datEnterKey(form);   // các ô có sẵn trong HTML

applyGuide();          // chế độ hướng dẫn bật/tắt ở trang chờ

/* ---- Cài đặt bệnh án: loại · sinh viên · trạng thái · chữ hướng dẫn ----
   Đây là cài đặt của người viết chứ không phải dữ liệu bệnh án, nên gom vào một
   hộp thu gọn mở được ở mọi tab, thay vì nằm lẫn trong mục I và thanh lưu. */
const setBox = $('ba-settings');
$('open-settings')?.addEventListener('click', () => {
    setBox.open = true;
    setBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

const TYPE_TEN = { noi: 'Nội khoa', ngoai: 'Ngoại khoa', san: 'Sản khoa', nhi: 'Nhi khoa', cc: 'Cấp cứu' };
function refreshSettingsSummary() {
    const loai = TYPE_TEN[$('type-chips')?.querySelector('.type-chip.active')?.dataset.type] || '';
    const sv = ($('stu-name')?.value || '').trim();
    const tt = $('record-status')?.value === 'Hoàn thành' ? 'Hoàn thành' : 'Đang viết';
    const sum = $('ba-set-sum');
    if (sum) sum.textContent = [loai, sv, tt].filter(Boolean).join(' · ');
    const pill = $('status-pill');
    if (pill) {
        pill.textContent = tt;
        pill.classList.toggle('is-done', tt === 'Hoàn thành');
    }
}
setBox?.addEventListener('input', refreshSettingsSummary);
setBox?.addEventListener('change', refreshSettingsSummary);
$('type-chips')?.addEventListener('click', () => setTimeout(refreshSettingsSummary, 0));
refreshSettingsSummary();

/* Công tắc chữ hướng dẫn: dùng chung khóa với trang chờ nên bật ở đâu cũng như nhau */
const guideSel = $('ba-guide');
if (guideSel) {
    guideSel.value = guideOn() ? '1' : '0';
    guideSel.addEventListener('change', () => setGuide(guideSel.value === '1'));
}

buildChips();
const splitLines = (v) => String(v || '').split(/\n+/).map(x => x.trim()).filter(Boolean);

/* Gõ CLS xong chọn "để loại trừ …" thì gợi luôn các bệnh cảnh đang cân nhắc:
   red flag ở biện luận, chẩn đoán sơ bộ và danh sách chẩn đoán phân biệt. */
const clsTargets = () => [
    ...listRedFlags(),
    ...splitLines($('dx1-main')?.value),
    ...splitLines($('differential-diagnosis')?.value).map(x => x.replace(/^\d+[.)]\s*/, '')),
    ...derivedClsDetail().map(d => d.dich)
].filter(Boolean);

buildPickers({ autoGrow });

/* Mục XI: mỗi đề nghị một dòng, mục đích bám theo nhánh biện luận ở mục X */
const clsDeNghi = initClsDeNghi({
    field: $('labs-proposed'),
    host: $('cls-dn-list'), addBtn: $('cls-dn-add'), blHost: $('cls-dn-bl'),
    derived: derivedClsDetail, required: labsCanCo, targets: clsTargets,
    autoGrow, toast: showToast,
    onChange: () => { updateProgress(); scheduleSave(); }
});

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

/* II. Lý do vào viện: mỗi triệu chứng một viên. Viên đầu tiên là triệu chứng chính
   của bệnh sử, phần còn lại rơi xuống ô "triệu chứng đi kèm" — chỉ ghi khi ô đó
   còn trống hoặc vẫn đúng bản máy điền lần trước, người dùng sửa tay là máy buông. */
let autoMain = '', autoAssoc = '';
const lyDo = initLyDo({
    field: $('reason-for-admission'), host: $('ld-host'),
    onChange: () => { lyDoIntoBenhSu(); updateProgress(); scheduleSave(); }
});

function lyDoIntoBenhSu() {
    if (!lyDo) return;
    const [main, ...phu] = lyDo.get();
    const el = $('hx-sym-name');
    if (el && main && (!el.value.trim() || el.value.trim() === autoMain)) {
        el.value = main;
        autoMain = main;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        syncMainSymFields();
    }
    // Ô thứ sáu là chỗ trống dùng chung: chọn "Đau ngực" thì nó thành "Yếu tố tăng /
    // giảm", nhét triệu chứng phụ vào đó là sai nhãn. Chỉ ghi khi nó còn đúng nghĩa.
    const as = $('hx-sym-assoc');
    const slotOk = mainSymLabels().some(x => x.id === 'hx-sym-assoc' && /đi kèm/i.test(x.label));
    const text = phu.join(', ');
    if (as && text && slotOk && (!as.value.trim() || as.value.trim() === autoAssoc)) {
        as.value = text;
        autoAssoc = text;
        as.dispatchEvent(new Event('input', { bubbles: true }));
    }
    renderLyDoActions();
    refreshPhanDo();
    hxChecklist();
}

/* Triệu chứng chính đã có chỗ riêng, còn triệu chứng phụ thì thuộc về mốc khởi phát
   của bệnh sử. Không tự nhét vào (dễ sai mốc) — bày ra một nút để bấm. */
const autoPhu = new Set();      // triệu chứng phụ do máy đưa vào mốc khởi phát
function renderLyDoActions() {
    const box = $('ld-tobs');
    if (!box || !lyDo) return;
    const [main, ...phu] = lyDo.get();
    if (main) syncPhuVaoMoc(phu);
    const daCo = [...autoPhu];
    box.innerHTML = daCo.length
        ? `<b>Triệu chứng phụ</b> <span>${daCo.map(x => x.replace(/[<>&]/g, '')).join(', ')}</span>
           <span class="ld-done"><i class="fas fa-circle-check"></i> đã ghi vào mốc khởi phát của bệnh sử</span>`
        : '';
}

/* Thêm chip ở lý do vào viện là triệu chứng phụ nằm luôn trong mốc khởi phát;
   bỏ chip thì gỡ ra khỏi mốc — chỉ gỡ đúng cái máy đã tự thêm. */
function syncPhuVaoMoc(phu) {
    const low = (x) => String(x || '').trim().toLowerCase();
    const all = getSteps().slice();
    let doi = false;
    if (!all.length && phu.length) {
        all.push({ id: 'm' + Date.now().toString(36), phase: 'truoc', n: '', u: 'ngày', s: '', refs: [] });
        doi = true;
    }
    const dau = all[0];
    if (!dau) return;
    const ys = () => String(dau.s || '').split(';').map(x => x.trim()).filter(Boolean);

    [...autoPhu].forEach(t => {
        if (phu.some(p => low(p) === low(t))) return;
        autoPhu.delete(t);
        const left = ys().filter(x => low(x) !== low(t));
        if (left.length !== ys().length) { dau.s = left.join('; '); doi = true; }
    });
    phu.forEach(t => {
        if (autoPhu.has(t) || all.some(m => low(m.s).includes(low(t)))) return;
        autoPhu.add(t);
        dau.s = [...ys(), t].join('; ');
        doi = true;
    });
    if (!doi) return;
    setSteps(all);
    refreshSteps();
}



/* Radar bỏ sót: tick một bệnh cảnh nguy hiểm là đưa thẳng vào "cần loại trừ khẩn" ở mục X */
document.getElementById('hx-check')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rf]');
    if (!b) return;
    toggleRedFlag(b.dataset.rf);
    hxChecklist();
    scheduleSave();
});

initFindings({ onChange: () => { growAll(); updateProgress(); scheduleSave(); } });

/* Mục VIII -> mục X: chờ gõ xong (600ms) rồi mới tạo thẻ, không tạo thẻ dở dang */
let problemTimer;
function scheduleProblemSync() {
    clearTimeout(problemTimer);
    problemTimer = setTimeout(() => syncFromProblems(), 600);
}

/* Mục X -> mục IX: chỉ điền khi ô còn trống, không đè lên chữ sinh viên đã sửa tay */
function cascadeToDiagnosis() {
    const { soBo, phanBiet } = derivedDiagnosis();
    if (soBo && !$('dx1-main').value.trim()) {
        $('dx1-main').value = soBo;
        dxBinder.dx1.sync();
    }
    if (phanBiet && !$('differential-diagnosis').value.trim()) {
        $('differential-diagnosis').value = phanBiet;
        autoGrow($('differential-diagnosis'));
    }
}

initBienLuan({
    onChange: () => { blBinder.sync(); cascadeToDiagnosis(); clsDeNghi?.refresh(); updateProgress(); scheduleSave(); },
    onNoProblems: () => showToast('Chưa có vấn đề nào ở mục VIII — điền Đặt vấn đề trước.', 'warning'),
    onHarvest: (n) => showToast(n
        ? `Đã đổ ${n} dấu chứng từ bệnh sử và phần khám — xóa bớt cái không liên quan.`
        : 'Không có dấu chứng mới để đổ vào.', n ? 'success' : 'warning')
});

/* Phơi nhiễm: hỏi tách từng nguồn rồi ghép thành một câu cho ô tiền căn */
const ENV_FIELDS = [['nghề nghiệp', 'env-job'], ['dịch tễ', 'env-area'],
['tiếp xúc người bệnh', 'env-contact'], ['tiếp xúc động vật', 'env-animal'],
['nguồn nước – ăn uống', 'env-water'], ['đi lại gần đây', 'env-travel']];

function envText() {
    const parts = ENV_FIELDS
        .map(([k, id]) => ($(id)?.value || '').trim() && `${k} ${($(id).value).trim()}`)
        .filter(Boolean);
    return parts.join('; ');
}
let lastEnv = '';
function calcEnv() {
    const out = $('env-out');
    if (out) out.textContent = envText() || 'Chưa ghi nhận yếu tố phơi nhiễm đặc biệt';
}

/* Điền xong là ghi thẳng vào ô tiền căn, khỏi bấm nút — chỉ ghi khi ô còn trống
   hoặc vẫn đúng bản máy ghép lần trước, người dùng sửa tay là máy buông. */
ENV_FIELDS.forEach(([, id]) => $(id)?.addEventListener('change', () => {
    const el = $('history-environment');
    const t = envText();
    if (!el || !t) return;
    const cur = el.value.trim();
    if (cur && cur !== lastEnv) return;
    el.value = t;
    lastEnv = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
}));

/* Tiền căn nội / ngoại khoa: danh sách "CNV bao lâu, nội dung" -> ghép vào ô chữ.
   Bệnh nền và thuốc đang dùng là một cặp: dòng bệnh soi thẳng vào danh sách thuốc
   (khỏi gõ hai nơi), còn nút "+ thuốc" thì thêm dòng thuốc đã gắn sẵn bệnh đó. */
let dsThuoc = null;           // gán ở phần "Thuốc đang dùng" bên dưới

/** Thuốc đang dùng đã gắn đúng một bệnh nền — ["Amlodipine 5 mg 1 viên", …] */
function thuocCuaBenh(benh) {
    const b = fold(benh).trim();
    if (!dsThuoc || !b) return [];
    return dsThuoc.get()
        .filter(r => { const c = fold(r.c).trim(); return c && (c === b || c.includes(b) || b.includes(c)); })
        .map(r => [r.a, r.b].map(x => String(x || '').trim()).filter(Boolean).join(' '));
}

const cnvInternal = $('cnv-internal') && createCnvList({
    host: $('cnv-internal'), addBtn: $('cnv-internal-add'),
    groups: BENH_GROUPS, pickTitle: 'Chọn bệnh nền theo chuyên khoa', trangThai: true,
    thuocCuaBenh,
    onAddThuoc: (benh) => {
        const goi = thuocTheoBenh(benh);
        dsThuoc?.add({ a: goi[0] || '', c: benh });
        refreshThuocLink();
        $('tc-thuoc-list')?.querySelector('.dl-row:last-of-type .dl-a')?.focus();
        showToast(goi.length
            ? `Đã thêm dòng thuốc cho “${benh}” — sửa lại cho đúng toa bệnh nhân.`
            : `Đã thêm dòng thuốc cho “${benh}”.`, 'success');
    },
    onChange: () => { cnvIntoField(cnvInternal, 'history-internal'); refreshThuocLink(); updateProgress(); scheduleSave(); }
});
const cnvSurgery = $('cnv-surgery') && createCnvList({
    host: $('cnv-surgery'), addBtn: $('cnv-surgery-add'),
    groups: PHAU_THUAT_NHOM, pickTitle: 'Chọn loại phẫu thuật đã mổ',
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

/* ---------- Xương gãy: chọn xương -> cộng máu mất -> phân độ sốc ---------- */
let gayXuong = [];
const gxHost = $('gx-list');

function gxRender() {
    if (!gxHost) return;
    gxHost.innerHTML = gayXuong.length ? gayXuong.map((r, i) => {
        const b = XUONG_GAY.find(x => x.ten === r.ten);
        const so = Math.max(1, parseInt(r.n) || 1);
        const ml = b ? `${b.lo * so}–${b.hi * so} ml` : '';
        return `<div class="gx-row" data-i="${i}">
            <select class="calc-in gx-ten" data-k="ten" aria-label="Xương gãy">
                <option value="">— chọn xương —</option>
                ${XUONG_GAY.map(x => `<option ${x.ten === r.ten ? 'selected' : ''}>${x.ten}</option>`).join('')}
            </select>
            <input class="calc-in gx-n" data-k="n" type="number" min="1" value="${so}" aria-label="Số xương">
            <span class="gx-ml">${ml}</span>
            <button type="button" class="gx-x" data-act="del" aria-label="Xóa"><i class="fas fa-xmark"></i></button>
        </div>`;
    }).join('') : '<p class="gx-empty">Chưa chọn xương nào — bấm “Thêm xương gãy”.</p>';
}

/** Cộng máu mất từ các xương đã chọn rồi đối chiếu thể tích máu của bệnh nhân */
function calcGayXuong() {
    const out = $('gx-out');
    if (!out) return null;
    const kg = parseFloat($('vital-weight')?.value);
    const isNhi = $('record-type')?.value === 'nhi';
    const r = tinhMauMat(gayXuong.filter(x => x.ten), kg,
        isNhi ? ML_PER_KG.treEm : ML_PER_KG.nguoiLon);
    if (!r) {
        out.textContent = 'Chưa chọn xương nào';
        out.parentElement.classList.remove('is-warn');
        return null;
    }
    const bits = [`Gãy ${r.soXuong} xương`,
        `máu mất ước lượng ${r.lo}–${r.hi} ml (trung bình ~${r.tb} ml)`];
    if (r.tvMau) bits.push(`thể tích máu ~${r.tvMau} ml`, `mất ~${r.pct}%`);
    else bits.push('nhập cân nặng ở phần sinh hiệu để quy ra % thể tích máu');
    out.innerHTML = bits.join(' · ')
        + (r.soc ? ` <span class="gx-soc s${r.soc.do}">Sốc ${r.soc.ten}</span>` : '');
    out.parentElement.classList.toggle('is-warn', !!r.soc && r.soc.do >= 3);
    return r;
}

if (gxHost) {
    $('gx-add')?.addEventListener('click', () => {
        gayXuong.push({ ten: '', n: 1 });
        gxRender();
        calcGayXuong();
        scheduleSave();
    });
    const gxEdit = (e) => {
        const row = e.target.closest('.gx-row');
        if (!row || !e.target.dataset.k) return;
        gayXuong[+row.dataset.i][e.target.dataset.k] = e.target.value;
        gxRender();
        calcGayXuong();
        updateProgress();
        scheduleSave();
    };
    gxHost.addEventListener('input', gxEdit);
    gxHost.addEventListener('change', gxEdit);
    gxHost.addEventListener('click', (e) => {
        if (!e.target.closest('[data-act="del"]')) return;
        gayXuong.splice(+e.target.closest('.gx-row').dataset.i, 1);
        gxRender();
        calcGayXuong();
        updateProgress();
        scheduleSave();
    });
    gxRender();
}

/* ---------- IV. TIỀN CĂN: các danh sách chọn thay vì gõ ---------- */

/** Đổ sẵn gợi ý vào một <datalist> */
function fillDatalist(id, items) {
    const dl = $(id);
    if (dl) dl.innerHTML = items.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">`).join('');
}
fillDatalist('tc-reaction-list', DI_UNG_BIEU_HIEN);
fillDatalist('tc-quanhe-list', QUAN_HE);
fillDatalist('ob-cycle-list', KINH_NGUYET.chuKy);
fillDatalist('ob-days-list', KINH_NGUYET.soNgay);
fillDatalist('ob-amount-list', KINH_NGUYET.luong);
fillDatalist('ob-dys-list', KINH_NGUYET.dauBung);
fillDatalist('ob-contra-list', NGUA_THAI);
fillDatalist('ob-ketcuc-list', KET_CUC_THAI);

const tcOnChange = () => { updateProgress(); scheduleSave(); };

/* ---------- Thuốc đang dùng ↔ bệnh nền: hai chiều ----------
   Chiều xuôi : khai bệnh nền -> gợi thuốc thường dùng để bấm thêm.
   Chiều ngược: thấy thuốc mà tiền căn chưa có bệnh tương ứng -> nhắc bổ sung.
   Chọn tên thuốc thì máy điền luôn liều thường dùng và bệnh nền tương ứng. */

/** Tên các bệnh nền đã khai — gồm cả dòng người dùng tự gõ vào ô chữ */
function benhNenList() {
    const tuList = cnvInternal ? cnvInternal.names() : [];
    const tuChu = String($('history-internal')?.value || '').split('\n')
        .map(l => l.replace(/^cnv\s*[\d.,]*\s*(ngày|tuần|tháng|năm)?\s*,?\s*/i, '').split(' — ')[0].trim())
        .filter(x => x && !/^chưa ghi nhận/i.test(x));
    return [...new Set([...tuList, ...tuChu])];
}

dsThuoc = createDoiList({
    host: $('tc-thuoc-list'), field: $('history-drugs'), addBtn: $('tc-thuoc-add'),
    phA: 'Tên thuốc', phB: 'Liều – cách dùng', groupsA: THUOC_GROUPS,
    phC: 'Dùng cho bệnh nào', listC: 'tc-benhnen-list', markC: 'điều trị',
    pickTitle: 'Chọn thuốc theo nhóm',
    suggest: (ten) => {
        const t = findThuoc(ten);
        if (!t) return '';
        return [t.hamLuong, t.lieu, t.soLan && 'x ' + t.soLan, t.duong].filter(Boolean).join(' ');
    },
    // Thuốc chỉ tự gắn vào bệnh ĐÃ khai — không tự bịa thêm bệnh nền cho bệnh nhân
    suggestC: (ten) => {
        const goi = benhCuaThuoc(ten);
        if (!goi.length) return '';
        const daKhai = benhNenList();
        return goi.find(b => daKhai.some(k => fold(k).includes(fold(b)) || fold(b).includes(fold(k)))) || '';
    },
    empty: 'Chưa ghi thuốc nào — bấm “Thêm dòng” rồi chọn tên thuốc.',
    onChange: () => { refreshThuocLink(); tcOnChange(); }
});

/** Vẽ lại phần gợi ý + nhắc nhở, và cập nhật thuốc hiện trên từng dòng bệnh nền */
function refreshThuocLink() {
    const box = $('tc-thuoc-goi');
    const dl = $('tc-benhnen-list');
    if (!dsThuoc || !box) return;

    const benhNen = benhNenList();
    if (dl) dl.innerHTML = benhNen.map(b => `<option value="${String(b).replace(/"/g, '&quot;')}">`).join('');

    const rows = dsThuoc.get();
    const daCo = (ten) => rows.some(r => fold(r.a).startsWith(fold(ten).split(' ')[0]));
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const out = [];
    // 0. Thuốc đang uống trùng với tác nhân dị ứng đã khai — mâu thuẫn nặng nhất, để trên cùng
    const diUng = fold($('history-allergy')?.value || '');
    rows.forEach(r => {
        const w = fold(r.a).replace(/[^a-z0-9 ]/g, ' ').trim().split(' ')[0];
        if (w.length < 4 || !diUng.includes(w)) return;
        out.push(`<div class="tg-warn"><i class="fas fa-triangle-exclamation"></i>
            <b>${esc(r.a)}</b> đang dùng ở nhà nhưng tiền căn lại ghi dị ứng đúng thuốc này —
            hỏi lại bệnh nhân trước khi ghi vào bệnh án.</div>`);
    });
    // 0b. Đã trả lời "không có bệnh mạn tính" mà vẫn đang uống thuốc điều trị bệnh mạn
    if (getAsk().benhNen === 'khong' && rows.some(r => benhCuaThuoc(r.a).length)) {
        out.push(`<div class="tg-warn"><i class="fas fa-triangle-exclamation"></i>
            Đã trả lời <b>không có bệnh mạn tính</b> nhưng vẫn có thuốc điều trị bệnh mạn trong danh sách —
            xem lại câu trả lời ở mục “Bệnh đã có”.</div>`);
    }
    // 1. Bệnh nền đã khai nhưng chưa có thuốc nào -> bày sẵn thuốc thường dùng
    benhNen.forEach(b => {
        if (thuocCuaBenh(b).length) return;
        const goi = thuocTheoBenh(b).filter(t => !daCo(t)).slice(0, 6);
        out.push(`<div class="tg-line"><i class="fas fa-pills"></i>
            <span class="tg-benh">${esc(b)}</span> — chưa ghi thuốc nào.
            ${goi.length ? goi.map(t => `<button type="button" class="tg-chip" data-add="${esc(t)}" data-benh="${esc(b)}">+ ${esc(t)}</button>`).join('')
                : '<em>Nếu bệnh nhân không uống thuốc gì thì ghi rõ “không điều trị gì” ở dòng bệnh.</em>'}</div>`);
    });
    // 2. Thuốc đang dùng nhưng tiền căn chưa có bệnh tương ứng -> bổ sung tiền căn
    rows.forEach(r => {
        if (String(r.c || '').trim()) return;
        const goi = benhCuaThuoc(r.a).filter(b => !benhNen.some(k => fold(k).includes(fold(b))));
        if (!goi.length) return;
        out.push(`<div class="tg-warn"><i class="fas fa-triangle-exclamation"></i>
            Đang dùng <b>${esc(r.a)}</b> mà tiền căn nội khoa chưa có bệnh tương ứng —
            ${goi.slice(0, 3).map(b => `<button type="button" class="tg-chip" data-benh-add="${esc(b)}" data-thuoc="${esc(r.a)}">+ ${esc(b)}</button>`).join('')}</div>`);
    });
    box.innerHTML = out.join('');

    // Viền vàng cho dòng thuốc chưa gắn bệnh, để mắt quét là thấy chỗ còn hở
    $('tc-thuoc-list')?.querySelectorAll('.dl-row').forEach(el => {
        const a = el.querySelector('.dl-a')?.value.trim();
        const c = el.querySelector('.dl-c')?.value.trim();
        el.classList.toggle('no-link', !!a && !c);
    });

    // Đang gõ trong danh sách bệnh nền thì đừng vẽ lại — vẽ lại là mất chỗ con trỏ
    if (!$('cnv-internal')?.contains(document.activeElement)) {
        cnvInternal?.render();
        cnvIntoField(cnvInternal, 'history-internal');   // dòng tiền căn mang theo thuốc của bệnh đó
    }
    autoFillAnticoag(rows);
}

/* Bấm chip: thêm thuốc cho bệnh, hoặc thêm bệnh nền mà thuốc đang ám chỉ */
$('tc-thuoc-goi')?.addEventListener('click', (e) => {
    const them = e.target.closest('[data-add]');
    if (them) {
        dsThuoc?.add({ a: them.dataset.add, c: them.dataset.benh });
        refreshThuocLink();
        return showToast(`Đã thêm ${them.dataset.add} cho ${them.dataset.benh} — kiểm tra lại liều.`, 'success');
    }
    const benh = e.target.closest('[data-benh-add]');
    if (!benh || !cnvInternal) return;
    const cur = cnvInternal.get();
    cnvInternal.set([...cur, { n: '', u: 'năm', s: benh.dataset.benhAdd, tt: 'đang điều trị đều', thuoc: '' }]);
    // Gắn luôn thuốc đang dùng vào bệnh vừa thêm, khỏi phải chọn lại
    dsThuoc?.setBenh(benh.dataset.thuoc, benh.dataset.benhAdd);
    cnvIntoField(cnvInternal, 'history-internal');
    refreshThuocLink();
    updateProgress(); scheduleSave();
    $('cnv-internal')?.querySelector('.cnv-row:last-of-type .cnv-n')?.focus();
    showToast(`Đã thêm “${benh.dataset.benhAdd}” vào tiền căn nội khoa — nhớ ghi mắc bao lâu.`, 'success');
});

/* Bệnh án cũ ghi thuốc ngay trên dòng bệnh nền. Nay thuốc chỉ ở một chỗ duy nhất,
   nên dời chúng sang danh sách "Thuốc đang dùng" và gắn đúng bệnh của nó. */
function migrateThuocBenhNen() {
    if (!cnvInternal || !dsThuoc) return;
    const rows = cnvInternal.get();
    const cu = rows.filter(r => String(r.thuoc || '').trim());
    if (!cu.length) return;
    cu.forEach(r => String(r.thuoc).split(/[;,]/).map(x => x.trim()).filter(Boolean)
        .forEach(t => dsThuoc.add({ a: t, c: String(r.s || '').trim() })));
    cnvInternal.set(rows.map(r => ({ ...r, thuoc: '' })));
    cnvIntoField(cnvInternal, 'history-internal');
}

/* Trước mổ luôn phải biết bệnh nhân có đang dùng thuốc chống đông không —
   thuốc đã ghi ở trên thì tự chép xuống, khỏi hỏi lại lần hai. */
function autoFillAnticoag(rows) {
    const el = $('sx-hx-anticoag');
    if (!el || el.value.trim()) return;
    const re = /aspirin|clopidogrel|ticagrelor|warfarin|acenocoumarol|sintrom|rivaroxaban|apixaban|dabigatran|enoxaparin|heparin/i;
    const hit = rows.filter(r => re.test(r.a)).map(r => [r.a, r.b].filter(Boolean).join(' '));
    if (hit.length) el.value = hit.join('; ');
}

const dsDiUng = createDiUngList({
    host: $('tc-diung-list'), field: $('history-allergy'), addBtn: $('tc-diung-add'),
    groups: DI_UNG_NHOM, listB: 'tc-reaction-list',
    // Thêm một tác nhân dị ứng thì soi lại ngay danh sách thuốc đang uống
    onChange: () => { tcOnChange(); refreshThuocLink(); }
});

const dsGiaDinh = createGiaDinhList({
    host: $('tc-giadinh-list'), field: $('history-family'), addBtn: $('tc-giadinh-add'),
    groups: BENH_GROUPS, onChange: tcOnChange
});

const dsPara = createDoiList({
    host: $('tc-para-list'), field: $('history-obgyne'), addBtn: $('tc-para-add'),
    phA: 'Lần mang thai (năm)', phB: 'Kết cục', listB: 'ob-ketcuc-list',
    // Ô này còn chứa dòng PARA và dòng kinh nguyệt do nơi khác ghi — đừng nuốt mất
    keepOther: true,
    empty: 'Chưa ghi lần mang thai nào — bấm “Thêm dòng”.',
    onChange: tcOnChange
});

const tienCanLists = [dsThuoc, dsPara].filter(Boolean);
const syncTienCan = () => tienCanLists.forEach(l => l.sync());

/** Ghép câu tiền căn phụ khoa từ các ô kinh nguyệt */
function mensesText() {
    const v = (id) => ($(id)?.value || '').trim();
    const parts = [
        v('ob-menarche') && `có kinh lần đầu năm ${v('ob-menarche')} tuổi`,
        v('ob-cycle-type') && `chu kỳ ${v('ob-cycle-type')}`,
        v('ob-days') && `hành kinh ${v('ob-days')}`,
        v('ob-amount'), v('ob-dysmenorrhea'),
        v('ob-contraception') && `ngừa thai bằng ${v('ob-contraception')}`
    ].filter(Boolean);
    return parts.length ? 'Kinh nguyệt: ' + parts.join(', ') : '';
}
function calcMenses() {
    const out = $('ob-menses-out');
    if (!out) return '';
    const t = mensesText();
    out.textContent = t || 'Điền để máy ghép thành câu tiền căn phụ khoa';
    return t;
}
function applyMenses() {
    const t = calcMenses();
    if (t) upsertLine('history-obgyne', /^kinh nguyệt/i, t);
}

initRx({ onChange: () => { rxBinder.sync(); refreshRxSuggest(); updateProgress(); scheduleSave(); } });

/* Chẩn đoán đã ghi thì thuốc kinh điển của nó bày sẵn ngay trên bảng y lệnh —
   bấm một cái là có dòng thuốc, khỏi mở bảng chọn đi tìm tên. */
function refreshRxSuggest() {
    const host = $('rx-suggest');
    if (!host) return;
    const dx = ['dx1-main', 'dx2-main', 'dx1-assoc', 'dx2-assoc'].flatMap(id => splitLines($(id)?.value))
        .map(t => t.replace(/^\s*\d+[.)]\s*/, '').replace(/\s+—\s+.*$/, '').trim()).filter(Boolean);
    const dang = getRx().map(r => fold(r.ten).split(' ')[0]).filter(Boolean);
    const goi = [];
    dx.forEach(b => thuocTheoBenh(b).forEach(t => {
        const dau = fold(t).split(' ')[0];
        if (goi.some(g => g.t === t) || dang.includes(dau)) return;
        goi.push({ t, b });
    }));
    host.innerHTML = goi.length
        ? `<span class="rx-sglab"><i class="fas fa-wand-magic-sparkles"></i> Thường dùng cho chẩn đoán đang ghi:</span>`
        + goi.slice(0, 10).map(g => `<button type="button" class="rx-sg" data-t="${liEsc(g.t)}"
            title="Theo chẩn đoán ${liEsc(g.b)} — kiểm lại liều và chống chỉ định">+ ${liEsc(g.t)}</button>`).join('')
        : '';
}
$('rx-suggest')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    addRx([b.dataset.t]);
    showToast(`Đã thêm ${b.dataset.t} vào y lệnh — điền liều và đường dùng.`, 'success');
});

/* Vấn đề và chẩn đoán vừa đổi thì cả mạng gợi ý (chip khám, CLS bắt buộc,
   chip chẩn đoán, thuốc) phải nối lại — chờ gõ xong 500ms rồi mới chạy. */
let ctxTimer;
function scheduleCtx() {
    clearTimeout(ctxTimer);
    ctxTimer = setTimeout(() => {
        applyClinicalContext(getClinicalContext());
        clsDeNghi?.refresh();     // chip "CLS bắt buộc" của mục XI bám theo chẩn đoán
        refreshRxSuggest();
    }, 500);
}

/* Nhập viện là lúc thuốc nền hay bị bỏ quên — chép thẳng từ mục IV xuống y lệnh,
   kèm tên bệnh nó đang điều trị, để còn quyết định tiếp tục hay ngưng. */
$('rx-home')?.addEventListener('click', () => {
    const nha = dsThuoc?.get() || [];
    if (!nha.length) return showToast('Mục IV chưa ghi thuốc nào đang dùng ở nhà.', 'warning');
    const n = addRx(nha.map(r => r.a));
    showToast(n
        ? `Đã chép ${n} thuốc đang dùng ở nhà xuống y lệnh — sửa liều và ghi rõ cái nào tạm ngưng.`
        : 'Các thuốc đang dùng ở nhà đều đã có trong y lệnh.', n ? 'success' : 'info');
});

initTheoDoi({ onChange: () => { updateProgress(); scheduleSave(); } });

/* Phân độ ngay lúc hỏi bệnh: chọn đúng câu bệnh nhân trả lời, máy ráp thành
   NYHA / mMRC / CCS / thang đau… rồi ghi thẳng vào ô "Mức độ" của triệu chứng chính. */
const lastPhanDo = {};
initPhanDo({
    context: () => [
        ($('hx-sym-name')?.value || ''), ($('reason-for-admission')?.value || ''),
        ($('dx1-main')?.value || ''), ($('history-internal')?.value || '')
    ],
    severity: severityValue,
    onChange: () => { updateProgress(); scheduleSave(); },
    // Chọn tới đâu ghi tới đó: câu phân độ cũ của chính thang đó bị thay, chữ người
    // dùng tự gõ không bị đụng tới.
    apply: (text, s, auto) => {
        const el = $('hx-sym-severity');
        if (!el) return;
        const cur = el.value.trim();
        const prev = lastPhanDo[s.id] || '';
        if (prev && cur.includes(prev)) el.value = cur.replace(prev, text);
        else if (!cur) el.value = text;
        else if (!cur.includes(text)) el.value = cur + '; ' + text;
        lastPhanDo[s.id] = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (!auto) showToast('Đã ghi phân độ vào ô Mức độ của triệu chứng chính.', 'success');
    }
});

/* Âm tính có giá trị: bày sẵn các câu cần hỏi ngược của đúng bệnh cảnh.
   Bấm là ghi "không có"; hóa ra bệnh nhân CÓ thì mở bảng khai thác cho đủ tính chất
   rồi đưa vào mốc bệnh sử — âm tính hụt một câu là chẩn đoán phân biệt hụt một nhánh. */
initAmTinh({
    context: () => getClinicalContext().map(s => s.ten),
    onChange: () => { hxChecklist(); updateProgress(); scheduleSave(); },
    onPositive: (ten, cau) => openSymptomPicker({
        title: `Bệnh nhân CÓ “${ten}” — khai thác cho đủ`,
        initial: ten,
        onPick: (text) => {
            const t = String(text || '').trim() || ten;
            const steps = getSteps();
            const all = steps.length ? steps.slice()
                : [{ id: 'm' + Date.now().toString(36), phase: 'truoc', n: '', u: 'ngày', s: '', refs: [] }];
            const dau = all[0];
            dau.s = [String(dau.s || '').trim(), t].filter(Boolean).join('; ');
            setSteps(all);
            refreshSteps();
            refreshAmTinh();
            hxChecklist();
            updateProgress(); scheduleSave();
            showToast(`Đã chuyển “${cau}” thành triệu chứng dương tính trong mốc khởi phát.`, 'success');
        }
    })
});

initFold();

/* Mục nào chỉ hỏi khi cần (chấn thương, thai kỳ, thuốc lá…) thì có nút Có / Không
   ngay cạnh tiêu đề — trả lời "không" cũng là dữ kiện, không phải bỏ trống. */
initAsk({
    autoGrow,
    onChange: () => { updateProgress(); scheduleSave(); }
});

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
    calcGayXuong();
    calcBmi();
    calcBpAll();
    calcStay();
    calcSmoke();
    calcAlcohol();
    calcOnset();
    syncMainSymFields();
    calcScores();
    restoreStudent();
    showExamDate();
    hxChecklist();
    syncBenhKem();
    syncTienCan();
    lyDo?.sync();
    migrateThuocBenhNen();
    refreshThuocLink();
    clsDeNghi?.sync();
    calcMenses();
    runClinicalValidation();
    refreshRxSuggest();
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
    if (el.id === 'vital-weight') calcGayXuong();
    if (el.id.startsWith('ob-hx-') || el.id === 'vital-height') calcThaiGain();
    if (el.id.startsWith('ped-hx-') || el.id === 'vital-weight') calcMatNuoc();
    if (el.id === 'vital-bp' || el.id === 'adm-bp') calcBpAll();
    if (el.id === 'admission-date' || el.id === 'record-datetime') { calcStay(); calcOnset(); showExamDate(); }
    if (el.id === 'admission-date') refreshSteps();   // mốc hiện ngày dương lịch tính từ ngày nhập viện
    if (el.id === 'hx-onset-date') calcOnset();
    if (STU_IDS.includes(el.id)) rememberStudent();
    if (el.id === 'hx-sym-name') syncMainSymFields();   // đổi bộ câu hỏi cho khớp triệu chứng
    if (el.id.startsWith('hx-') || el.id.startsWith('adm-')) { syncProse(); hxChecklist(); }
    if (el.id.startsWith('ob-hx-') || el.id.startsWith('ped-hx-')) syncProse();
    if (el.id.startsWith('ob-') || el.id === 'ob-menarche') calcMenses();
    if (el.id === 'problem-list') scheduleProblemSync();
    if (['problem-list', 'dx1-main', 'dx2-main', 'dx1-assoc', 'dx2-assoc',
        'differential-diagnosis', 'labs-proposed'].includes(el.id)) scheduleCtx();
    if (el.id.startsWith('dx1-')) dxBinder.dx1.sync();
    if (el.id.startsWith('dx2-')) dxBinder.dx2.sync();
    if (['smoke-cpd', 'smoke-from', 'smoke-to', 'patient-yob', 'patient-age'].includes(el.id)) calcSmoke();
    if (el.id.startsWith('alc-')) calcAlcohol();
    if (['vital-resp', 'vital-bp', 'patient-age', 'patient-yob'].includes(el.id)) calcScores();
    if (el.id.startsWith('vital-') || el.id.startsWith('gcs-') || el.id.startsWith('hx-sym-')) renderGrades();
    if (el.id === 'vital-bp' || el.id === 'vital-bmi') benhKem.forEach(l => l.regrade());
    if (el.id.startsWith('tr-')) calcTrauma();
    if (el.id.startsWith('env-')) calcEnv();
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
    if (e.target.id.startsWith('ob-hx-') || e.target.id.startsWith('ped-hx-')) syncProse();
    if (e.target.id.startsWith('tr-') || e.target.classList?.contains('burn-area')) calcTrauma();
    if (e.target.id === 'hx-onset-date' || e.target.id === 'admission-date') calcOnset();
    // Đổi tên triệu chứng chính xong (rời ô) thì vẽ lại để các mốc sau tự chép nó xuống
    if (e.target.id === 'hx-sym-name') refreshSteps();
    if (e.target.id === 'admission-date') refreshSteps();
    if (e.target.id === 'patient-gender') { syncGenderUi(); calcAlcohol(); }
    updateProgress(); scheduleSave();
});

/* Các ô máy tự tính (gói·năm, đơn vị cồn, PARA, kinh nguyệt) tự ghi thẳng xuống ô
   tiền căn khi rời ô. Trước đây mỗi khối còn một nút "Ghi vào tiền căn" — nhưng nút
   đó lúc nào cũng bị máy bấm hộ, để lại chỉ tổ rối mắt nên đã bỏ.
   `upsertLine` chỉ thay đúng dòng của nó, không đụng chữ người dùng tự viết. */
function applySmoke() {
    const s = calcSmoke();
    if (!s) return;
    upsertLine('history-habit', /^hút thuốc lá/i,
        `Hút thuốc lá ${s.cpd} điếu/ngày từ ${s.from} tuổi đến ${s.stopped ? s.to + ' tuổi (đã ngưng)' : 'nay'}` +
        ` — ${s.py.toFixed(1)} gói·năm`);
}

function applyAlcohol() {
    const a = calcAlcohol();
    if (!a) return;
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
}

function applyPara() {
    if (![1, 2, 3, 4].some(i => String($('para-' + i).value).trim())) return;
    const n = [1, 2, 3, 4].map(i => String(parseInt($('para-' + i).value) || 0));
    upsertLine('history-obgyne', /^para/i,
        `PARA ${n.join('')} (${n[0]} đủ tháng, ${n[1]} thiếu tháng, ${n[2]} sảy/phá, ${n[3]} con sống)`);
}

const autoApply = (ids, run) => ids.forEach(id => $(id)?.addEventListener('change', run));

autoApply(['smoke-cpd', 'smoke-from', 'smoke-to'], applySmoke);
autoApply(['alc-drink', 'alc-qty', 'alc-freq', 'alc-vol', 'alc-abv', 'alc-from', 'alc-to'], applyAlcohol);
autoApply(['para-1', 'para-2', 'para-3', 'para-4'], applyPara);
autoApply(['ob-menarche', 'ob-cycle-type', 'ob-days', 'ob-amount', 'ob-dysmenorrhea', 'ob-contraception'],
    applyMenses);

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

/* Khối "Đánh giá mức độ" luôn nằm cuối ô tóm tắt — nhận diện được thì hai nút
   "Tự động tóm tắt" và "Chèn vào tóm tắt" mới không xóa việc của nhau. */
const GRADE_BLOCK = /\n*Đánh giá mức độ:\n[\s\S]*$/;

$('grade-insert')?.addEventListener('click', () => {
    // Gộp cả phân độ hỏi bệnh (NYHA, CCS, thang đau…) với phân độ máy chấm từ số đo
    const text = [gradeToText(lastGrades), ...phanDoLines()].filter(Boolean).join('\n');
    if (!text) return showToast('Chưa có dữ liệu để chấm độ.', 'warning');
    // Bấm lại lần nữa thì thay khối cũ, đừng nối thêm một khối trùng phía dưới
    const el = $('summary');
    const cur = el.value.replace(GRADE_BLOCK, '').trim();
    el.value = cur ? cur + '\n\nĐánh giá mức độ:\n' + text : 'Đánh giá mức độ:\n' + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    showToast('Đã chèn các đánh giá mức độ vào tóm tắt.', 'success');
});

/* Đổ cận lâm sàng sang mục XI. Mỗi đề nghị mang theo mục đích của chính nhánh
   đã sinh ra nó, cộng thêm nhóm thường quy — mục XI không còn là một danh sách trần. */
const CLS_THUONG_QUY = ['Công thức máu', 'Sinh hóa máu cơ bản (đường, ure, creatinin, ion đồ)',
    'Tổng phân tích nước tiểu', 'X-quang ngực thẳng', 'ECG 12 chuyển đạo'];

$('bl-to-cls')?.addEventListener('click', () => {
    const list = derivedClsDetail();
    if (!list.length) return showToast('Chưa ghi cận lâm sàng ở nhánh nào trong sơ đồ biện luận.', 'warning');
    list.forEach(d => clsDeNghi?.add(d));
    CLS_THUONG_QUY.forEach(ten => clsDeNghi?.add({ ten, mucDich: 'xét nghiệm thường quy', dich: '' }));
    showToast(`Đã đổ ${list.length} cận lâm sàng sang mục XI, mỗi cái kèm mục đích của nhánh — `
        + 'còn phải ghi thêm mong tìm thấy gì ở từng dòng.', 'success');
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

/* Sinh hiệu lúc khám hay trùng với lúc nhập viện — chép một nút thay vì gõ lại 5 con số */
$('vital-copy-adm')?.addEventListener('click', () => {
    const n = ['pulse', 'bp', 'temp', 'resp', 'spo2'].filter(k => {
        const from = $('adm-' + k), to = $('vital-' + k);
        if (!from || !to || !from.value.trim()) return false;
        to.value = from.value.trim();
        to.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }).length;
    showToast(n ? `Đã chép ${n} chỉ số từ sinh hiệu lúc nhập viện — nhớ sửa lại nếu hôm nay khác`
        : 'Chưa ghi sinh hiệu lúc nhập viện ở mục III. Bệnh sử');
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
/** Đọc mục VIII thành danh sách vấn đề (đã bỏ số thứ tự) */
function problemLines() {
    return ($('problem-list')?.value || '').split('\n')
        .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
}

/** Ghi lại mục VIII, tự đánh số, rồi tạo thẻ biện luận cho vấn đề mới */
function setProblems(list) {
    const el = $('problem-list');
    el.value = list.map((t, i) => `${i + 1}. ${t}`).join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    return syncFromProblems();
}

$('auto-problem-btn')?.addEventListener('click', () => {
    const text = buildProblems();
    if (!text) return showToast('Chưa đủ dữ liệu để gợi ý — nhập lý do vào viện, sinh hiệu hoặc cận lâm sàng trước.', 'warning');
    // Gộp vào những gì sinh viên đã gõ thay vì xóa trắng ô
    const co = problemLines();
    const them = text.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(t => t && !co.some(y => y.toLowerCase() === t.toLowerCase()));
    if (!them.length) return showToast('Các vấn đề gợi ý đã có sẵn trong danh sách.', 'warning');
    setProblems([...co, ...them]);
    showToast(`Đã thêm ${them.length} vấn đề và tạo khung biện luận tương ứng.`, 'success');
});

$('pick-problem-btn')?.addEventListener('click', () => {
    openListPicker({
        title: 'Chọn vấn đề / hội chứng theo chuyên khoa',
        groups: VAN_DE_NHOM, multi: true, value: problemLines().join('\n'),
        onPick: (names) => {
            if (!names.length) return;
            const added = setProblems(names);
            showToast(added
                ? `Đã đặt ${names.length} vấn đề — mục X vừa mọc ${added} thẻ biện luận mới.`
                : `Đã cập nhật ${names.length} vấn đề ở mục VIII.`, 'success');
            updateProgress(); scheduleSave();
        }
    });
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
    const el = $('summary');
    const grade = el.value.match(GRADE_BLOCK)?.[0] || '';   // giữ lại khối đánh giá mức độ
    el.value = buildSummary() + grade;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow(el);
    showToast(grade
        ? 'Đã tạo tóm tắt từ dữ liệu đã nhập — khối đánh giá mức độ vẫn giữ nguyên.'
        : 'Đã tạo tóm tắt từ dữ liệu đã nhập.', 'success');
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
    if (!await doSave({ force: true })) return;   // lưu hỏng thì ở lại, đừng rời trang
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
    if (!await doSave({ force: true })) {
        btn.disabled = false;
        btn.querySelector('.button-text').classList.remove('hidden');
        btn.querySelector('.button-spinner').classList.add('hidden');
        return;
    }
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





