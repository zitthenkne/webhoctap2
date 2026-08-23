import { showToast } from '../../core/utils.js';
import { getRecord, syncFromCloud, authReady, isSignedIn } from './record-store.js';
import { auth } from '../../core/firebase-init.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const recordId = new URL(location.href).searchParams.get('id');

/* ---------- định dạng ---------- */
function fmtDate(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function fmtDateTime(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? `${m[4]}:${m[5]} ngày ${m[3]}/${m[2]}/${m[1]}` : String(v);
}

/* ---------- khung dữ liệu để render + xuất text ---------- */
const VITAL_RANGE = { 'Mạch': [60, 100], 'Nhiệt độ': [36, 37.5], 'Nhịp thở': [12, 20], 'SpO2': [95, 100] };

function buildModel(r) {
    const h = r.hanhChinh || {}, t = r.tienSu || {}, k = r.khamBenh || {}, s = k.sinhTon || {};
    return [
        ['I. HÀNH CHÍNH', 'fa-user', [
            ['Họ và tên', h.hoTen], ['Năm sinh', h.namSinh], ['Tuổi', h.tuoi],
            ['Giới tính', h.gioiTinh], ['Dân tộc', h.danToc], ['Nghề nghiệp', h.ngheNghiep],
            ['Địa chỉ', h.diaChi], ['Người liên hệ', h.nguoiLienHe], ['SĐT liên hệ', h.sdtLienHe],
            ['Giờ vào viện', h.gioVaoVien], ['Ngày vào viện', fmtDate(h.ngayVaoVien)],
            ['Ngày giờ làm bệnh án', fmtDateTime(h.ngayLamBenhAn)],
            ['Bệnh viện', h.benhVien], ['Số phòng', h.soPhong || h.roomNumber], ['Số giường', h.soGiuong || h.bedNumber]
        ]],
        ['II. LÝ DO VÀO VIỆN', 'fa-sign-in-alt', [['', r.lyDoVaoVien]]],
        ['III. BỆNH SỬ', 'fa-history', [['', r.benhSu]]],
        ['IV. TIỀN SỬ', 'fa-notes-medical', [
            ['Nội khoa', t.noiKhoa], ['Ngoại khoa', t.ngoaiKhoa], ['Sản phụ khoa', t.sanPhuKhoa],
            ['Dị ứng', t.diUng], ['Thói quen', t.thoiQuen], ['Gia đình', t.giaDinh]
        ]],
        ['V. KHÁM BỆNH', 'fa-stethoscope', [
            ['@vitals', [
                ['Mạch', s.mach, 'l/p'], ['Nhiệt độ', s.nhietDo, '°C'], ['Huyết áp', s.huyetAp, 'mmHg'],
                ['Nhịp thở', s.nhipTho, 'l/p'], ['SpO2', s.spo2, '%'],
                ['Chiều cao', s.chieuCao, 'cm'], ['Cân nặng', s.canNang, 'kg'], ['BMI', s.bmi, '']
            ]],
            ['Toàn thân', k.toanThan], ['Thể trạng', k.theTrang], ['Da, niêm mạc', k.daNiemMac],
            ['Lông, tóc, móng', k.longTocMong], ['Tuyến giáp, hạch ngoại vi', k.tuyenGiapHach],
            ['Dấu hiệu phù, xuất huyết', k.phuXuatHuyet],
            ['Tuần hoàn (Tim mạch)', k.circulation], ['Hô hấp', k.respiratory], ['Tiêu hóa', k.digestive],
            ['Thận - Tiết niệu - Sinh dục', k.urinary], ['Thần kinh', k.neuro],
            ['Cơ - Xương - Khớp', k.musculoskeletal], ['Tai - Mũi - Họng', k.ent],
            ['Răng - Hàm - Mặt', k.dental], ['Mắt', k.eye]
        ]],
        ['VI. TÓM TẮT BỆNH ÁN', 'fa-clipboard-list', [['', r.tomTatBenhAn]]],
        ['VII. CHẨN ĐOÁN SƠ BỘ', 'fa-search', [['', r.chanDoanSoBo]]],
        ['VIII. CẬN LÂM SÀNG ĐỀ NGHỊ', 'fa-vials', [['', r.canLamSangDeNghi]]],
        ['IX. KẾT QUẢ CẬN LÂM SÀNG ĐÃ CÓ', 'fa-microscope', [['', r.ketQuaCanLamSang]]],
        ['X. CHẨN ĐOÁN XÁC ĐỊNH', 'fa-check-circle', [['', r.chanDoanXacDinh]]],
        ['XI. HƯỚNG ĐIỀU TRỊ', 'fa-syringe', [['', r.huongDieuTri]]],
        ['XII. TIÊN LƯỢNG', 'fa-heartbeat', [['', r.tienLuong]]],
        ['XIII. DỰ PHÒNG', 'fa-shield-halved', [['', r.duPhong]]]
    ];
}

/* ---------- render ---------- */
function vitalsHtml(items) {
    const chips = items.filter(([, v]) => String(v ?? '').trim()).map(([label, v, unit]) => {
        const range = VITAL_RANGE[label];
        const num = parseFloat(v);
        const warn = range && !isNaN(num) && (num < range[0] || num > range[1]);
        return `<span class="vital-chip inline-flex items-baseline gap-1.5 rounded-xl px-3 py-1.5 text-sm border ${warn ? 'bg-orange-50 border-orange-300' : 'bg-pink-50/60 border-pink-200'}">
            <span class="text-gray-400 text-xs">${esc(label)}</span>
            <b class="${warn ? 'text-orange-600' : 'text-gray-700'}">${esc(v)}${unit ? ' ' + unit : ''}</b>
            ${warn ? '<i class="fas fa-triangle-exclamation text-orange-400 text-[10px]"></i>' : ''}
        </span>`;
    }).join('');
    return chips ? `<div class="flex flex-wrap gap-2 mb-1">${chips}</div>` : '';
}

function fieldHtml(label, value) {
    if (!String(value ?? '').trim()) return '';
    // Số điện thoại: bấm là gọi được luôn trên điện thoại
    const tel = /SĐT|Điện thoại/i.test(label) && String(value).replace(/[^0-9+]/g, '');
    const shown = tel && tel.length >= 8
        ? `<a href="tel:${esc(tel)}" class="text-pink-600 underline underline-offset-2 font-medium">${esc(value)}</a>`
        : `<span class="field-value text-gray-700 break-words whitespace-pre-line">${esc(value)}</span>`;
    return `<div class="leading-relaxed">${label ? `<span class="field-label font-semibold text-pink-500">${esc(label)}:</span> ` : ''}${shown}</div>`;
}

function sectionHtml(title, icon, rows, index) {
    const body = rows.map(([label, value]) =>
        label === '@vitals' ? vitalsHtml(value) : fieldHtml(label, value)).join('');
    if (!body) return '';
    // Hành chính toàn là dòng ngắn -> xếp 2 cột cho đỡ dài
    const cls = index === 0 ? 'sec-grid' : 'space-y-2';
    return `<section id="sec-${index}" class="rec-section bg-pink-50/60 border border-pink-200 rounded-2xl p-4 sm:p-5 transition hover:border-pink-300">
        <h3 class="text-base sm:text-lg font-bold text-pink-600 mb-3 flex items-center gap-2"><i class="fas ${icon}"></i>${esc(title)}</h3>
        <div class="${cls}">${body}</div>
    </section>`;
}

function notFoundHtml() {
    return `<div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3"><i class="fas fa-file-circle-question text-2xl text-pink-400"></i></div>
        <p class="text-gray-600 font-bold">Không tìm thấy bệnh án</p>
        <p class="text-gray-400 text-sm mt-1 max-w-sm">${isSignedIn()
            ? 'Bệnh án này không có trong tài khoản của bạn.'
            : 'Bệnh án đang lưu trên máy đã tạo. Hãy đăng nhập để đồng bộ giữa các thiết bị.'}</p>
        <a href="../study-room/waiting-room.html" class="mt-4 px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold hover:bg-pink-600 transition">Về danh sách bệnh án</a>
    </div>`;
}

/* ---------- xuất text ---------- */
function toPlainText(record, model) {
    const lines = ['BỆNH ÁN NỘI KHOA', ''];
    for (const [title, , rows] of model) {
        const body = [];
        for (const [label, value] of rows) {
            if (label === '@vitals') {
                const v = value.filter(([, x]) => String(x ?? '').trim())
                    .map(([l, x, u]) => `${l}: ${x}${u ? ' ' + u : ''}`).join(' · ');
                if (v) body.push(v);
            } else if (String(value ?? '').trim()) {
                body.push(label ? `${label}: ${value}` : String(value));
            }
        }
        if (body.length) { lines.push(title, ...body, ''); }
    }
    return lines.join('\n').trim();
}

/* ---------- chạy ---------- */
let record = recordId ? getRecord(recordId) : null;
if (!record && recordId && await authReady()) {
    await syncFromCloud();
    record = getRecord(recordId);
}

const view = document.getElementById('medical-record-view');

if (!record) {
    view.innerHTML = notFoundHtml();
    document.getElementById('toc').style.display = 'none';
    document.getElementById('toc-fab').style.display = 'none';
} else {
    const model = buildModel(record);
    const sections = model.map(([t, i, rows], idx) => ({ title: t, html: sectionHtml(t, i, rows, idx), idx }))
        .filter(s => s.html);
    view.innerHTML = sections.length ? sections.map(s => s.html).join('') : `
        <div class="flex flex-col items-center justify-center py-14 text-center">
            <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3"><i class="fas fa-pen-to-square text-2xl text-pink-400"></i></div>
            <p class="text-gray-600 font-bold">Bệnh án này chưa có nội dung</p>
            <p class="text-gray-400 text-sm mt-1">Bấm Sửa để bắt đầu điền.</p>
            <a href="tao-benh-an.html?id=${encodeURIComponent(record.id)}" class="mt-4 px-5 py-2.5 bg-pink-500 text-white rounded-xl font-semibold hover:bg-pink-600 transition"><i class="fas fa-pen mr-1"></i>Sửa bệnh án</a>
        </div>`;

    // Mục lục (cột bên cho màn lớn, thẻ trượt cho điện thoại)
    const tocHtml = sections.map(s =>
        `<a href="#sec-${s.idx}" class="toc-link" data-target="sec-${s.idx}">${esc(s.title)}</a>`).join('');
    document.getElementById('toc-nav').innerHTML = tocHtml;
    document.getElementById('toc-nav-mobile').innerHTML = tocHtml;

    // Tiêu đề trang + đầu trang in
    const h = record.hanhChinh || {};
    const name = h.hoTen || 'Chưa đặt tên';
    document.title = 'Bệnh án - ' + name;
    document.getElementById('head-name').textContent = name;
    const meta = [h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.benhVien,
        (h.soPhong || h.roomNumber) && 'P.' + (h.soPhong || h.roomNumber)].filter(Boolean).join(' · ');
    document.getElementById('head-meta').textContent = meta;
    document.getElementById('print-sub').textContent = [name, meta].filter(Boolean).join(' — ');

    const editBtn = document.getElementById('edit-record-btn');
    editBtn.href = 'tao-benh-an.html?id=' + encodeURIComponent(record.id);
    editBtn.classList.remove('hidden');

    // Khối chữ ký (chỉ hiện khi in)
    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    document.getElementById('sign-date').textContent = dm
        ? `Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}`
        : 'Ngày ......  tháng ......  năm ..........';
    authReady().then(() => {
        const u = auth.currentUser;
        document.getElementById('sign-name').textContent =
            u ? (u.displayName || (u.email || '').split('@')[0] || '') : '';
    });

    // Đánh dấu mục đang xem trong mục lục
    const links = [...document.querySelectorAll('.toc-link')];
    const observer = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            links.forEach(l => l.classList.toggle('active', l.dataset.target === en.target.id));
        });
    }, { rootMargin: '-80px 0px -70% 0px' });
    document.querySelectorAll('.rec-section').forEach(s => observer.observe(s));

    /* ---------- hành động ---------- */
    const plain = () => toPlainText(record, model);

    const actions = {
        print: () => window.print(),
        edit: () => { location.href = editBtn.href; },
        copy: async () => {
            try {
                await navigator.clipboard.writeText(plain());
                showToast('Đã sao chép toàn bộ bệnh án.', 'success');
            } catch {
                showToast('Trình duyệt chặn sao chép. Hãy chọn và copy thủ công.', 'error');
            }
        },
        word: () => {
            const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
                <style>body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5}
                h2{text-align:center;font-size:14pt;text-transform:uppercase}
                h3{font-size:13pt;border-bottom:1px solid #000;margin:14pt 0 6pt}
                p{margin:0 0 4pt}</style></head><body>
                <h2>Bệnh án nội khoa</h2>` +
                model.map(([title, , rows]) => {
                    const body = rows.map(([label, value]) => {
                        if (label === '@vitals') {
                            const v = value.filter(([, x]) => String(x ?? '').trim())
                                .map(([l, x, u]) => `${l}: ${x}${u ? ' ' + u : ''}`).join(' · ');
                            return v ? `<p>${esc(v)}</p>` : '';
                        }
                        if (!String(value ?? '').trim()) return '';
                        return `<p>${label ? '<b>' + esc(label) + ':</b> ' : ''}${esc(value).replace(/\n/g, '<br>')}</p>`;
                    }).join('');
                    return body ? `<h3>${esc(title)}</h3>${body}` : '';
                }).join('') + '<\/body><\/html>';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
            a.download = `benh-an-${(h.hoTen || 'khong-ten').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.doc`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('Đã tải file Word.', 'success');
        },
        share: async () => {
            try { await navigator.share({ title: 'Bệnh án - ' + name, text: plain() }); }
            catch { /* người dùng hủy */ }
        }
    };

    ['print', 'copy', 'word', 'share'].forEach(act => {
        document.getElementById(act + '-btn')?.addEventListener('click', actions[act]);
    });
    if (navigator.share) document.getElementById('share-btn').classList.remove('hidden');

    document.getElementById('mobile-actions').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (b) actions[b.dataset.act]?.();
    });
}

// Thanh công cụ điện thoại
const bar = document.getElementById('mobile-actions');
document.getElementById('mobile-more').addEventListener('click', () => {
    bar.classList.toggle('translate-y-full');
});

// Thẻ trượt mục lục
const sheet = document.getElementById('toc-sheet');
const panel = document.getElementById('toc-panel');
const openSheet = () => {
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.remove('translate-y-full'));
};
const closeSheet = () => {
    panel.classList.add('translate-y-full');
    setTimeout(() => sheet.classList.add('hidden'), 200);
};
document.getElementById('toc-fab').addEventListener('click', openSheet);
sheet.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('.toc-link')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Ctrl/Cmd + P dùng bố cục in A4 sẵn có
