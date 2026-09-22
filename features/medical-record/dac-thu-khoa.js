/* =====================================================================
   dac-thu-khoa.js — "bệnh án khoa nào phải ra khoa đó"

   Trước file này, loại bệnh án chỉ là một dãy chip nằm trong Cài đặt: mở
   trang lên là mặc định Nội khoa, đổi sang Sản hay Nhi thì chỉ hiện thêm
   vài hộp nhỏ. Sinh viên đi lâm sàng Sản vẫn gõ một biểu mẫu nội khoa.

   File này làm ba việc, không sửa mạch nhập liệu của tao-benh-an.js:

   1. CỔNG CHỌN KHOA — bệnh án mới thì phải chọn khoa trước khi gõ. Nhưng
      nếu bệnh án nằm trong thư mục đã biết khoa (thư mục có ô "Chuyên khoa",
      hoặc tên khoa đọc ra được) thì tự chuyển luôn, KHÔNG hỏi lại.
   2. HỒ SƠ TỪNG KHOA — đổi tên mục, đổi gợi ý trong ô, đổi màu nhấn, và
      dựng bảng kiểm "những thứ khoa này bắt buộc phải có".
   3. MÁY TÍNH RIÊNG CỦA KHOA — Bishop, Leopold, tiền sản giật, tăng trưởng
      nhi, phân độ mất nước, hậu phẫu, đồng hồ vàng cấp cứu…

   Nạp SAU tao-benh-an.js: mọi nút của trang đã gắn sự kiện xong, nên chọn
   khoa ở cổng chỉ cần bấm hộ đúng cái chip có sẵn — không phải chép lại
   applyRecordType / openSpec / scheduleSave.
   ===================================================================== */
import { getFolder, folderSpec, folderMeta } from './folder-store.js';
import { showToast } from '../../core/utils.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = (id) => { const v = parseFloat($(id)?.value); return isFinite(v) ? v : null; };
const chu = (id) => String($(id)?.value || '').trim();

/* =====================================================================
   1. HỒ SƠ CHUYÊN KHOA
   ---------------------------------------------------------------------
   net    : mấy dòng in trên thẻ chọn khoa — cũng là câu trả lời cho
            "bệnh án khoa này khác khoa kia chỗ nào".
   nhan   : đổi chữ của mục / nhãn ô.
   ph     : đổi gợi ý gõ trong ô, vì cùng ô "Bụng" mà khoa Ngoại với khoa
            Sản cần hai thứ hoàn toàn khác nhau.
   kiem   : những ô khoa này bắt buộc phải có — dựng thành bảng kiểm.
   ===================================================================== */
const HO_SO = {
    noi: {
        ten: 'Nội khoa', icon: 'fa-heart-pulse', mau: '#0284c7',
        cham: 'Bệnh mạn tính, hệ cơ quan, diễn tiến theo thời gian',
        net: [
            'Bệnh mạn tính: phát hiện năm nào, tuân thủ ra sao, kiểm soát tới đâu',
            'Lược qua đủ sáu hệ cơ quan trước khi khám',
            'Diễn tiến bệnh theo mốc thời gian',
            'Thang điểm nội khoa: CURB-65, Glasgow, phân độ NYHA…'
        ],
        nhan: {
            'legend:tiencan': 'IV. TIỀN CĂN — bệnh nội khoa, thuốc đang dùng, thói quen',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — theo từng hệ cơ quan',
            'label:exam-abdomen': '6. Bụng'
        },
        ph: {
            'reason-for-admission': 'vd: Khó thở tăng dần 3 ngày',
            'exam-general': 'Tri giác, da niêm, tuyến giáp, hạch ngoại vi, phù, dấu mất nước…',
            'exam-abdomen': 'Bụng mềm, gan lách, tuần hoàn bàng hệ, cổ trướng, gõ đục vùng thấp…'
        }
    },
    ngoai: {
        ten: 'Ngoại khoa', icon: 'fa-scissors', mau: '#0d9488',
        cham: 'Cơ chế tổn thương, khám bụng ngoại khoa, cuộc mổ',
        net: [
            'Cơ chế chấn thương: vận tốc, vật gây thương tích, sơ cứu',
            'Khám bụng ngoại khoa: phản ứng, đề kháng, nghiệm pháp, thăm trực tràng',
            'Chỉ định và chuẩn bị cuộc mổ, phân loại ASA và loại vết mổ',
            'Tường trình phẫu thuật rồi theo dõi hậu phẫu từng ngày'
        ],
        nhan: {
            'legend:tiencan': 'IV. TIỀN CĂN — mổ cũ, chấn thương, gây mê',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — trọng tâm vùng tổn thương',
            'label:exam-abdomen': '6. Bụng — khám ngoại khoa'
        },
        ph: {
            'reason-for-admission': 'vd: Đau bụng hố chậu phải 12 giờ',
            'exam-general': 'Tri giác, da niêm, dấu mất máu (niêm nhạt, chi lạnh, CRT), tư thế giảm đau…',
            'exam-abdomen': 'Sẹo mổ, phản ứng — đề kháng thành bụng, điểm đau khu trú, nghiệm pháp, nhu động ruột…'
        }
    },
    san: {
        ten: 'Sản khoa', icon: 'fa-baby-carriage', mau: '#db2777',
        cham: 'PARA, tuổi thai, Leopold, chuyển dạ, hậu sản',
        net: [
            'PARA, tiền thai từng lần, kinh chót → tuổi thai và ngày dự sinh',
            'Bốn thủ thuật Leopold và chỉ số Bishop',
            'Chuyển dạ: cơn gò, ối, biểu đồ tim thai',
            'Tiền sản giật, cuộc sinh và theo dõi hậu sản'
        ],
        nhan: {
            // Bệnh án sản khoa hỏi TIỀN CĂN trước rồi mới tới BỆNH SỬ (Text 1.2)
            'legend:tiencan': 'III. TIỀN CĂN — sản khoa, phụ khoa, kế hoạch gia đình',
            'legend:benhsu': 'IV. BỆNH SỬ — kinh chót, tuổi thai, thai kỳ lần này',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — toàn thân và khám sản',
            'label:exam-abdomen': '6. Bụng — tử cung, ngôi thai',
            // Bệnh án sản khoa hỏi tên và số điện thoại CHỒNG, không phải "người liên hệ"
            'label:contact-name': 'Họ tên chồng',
            'label:contact-phone': 'SĐT chồng'
        },
        ph: {
            'reason-for-admission': 'vd: Thai 39 tuần, đau bụng từng cơn',
            'exam-general': 'Tri giác, da niêm, phù, mức tăng cân thai kỳ, dấu thiếu máu…',
            'exam-abdomen': 'Tử cung — bề cao, cơn gò, ngôi thai qua Leopold, tim thai, sẹo mổ lấy thai cũ…'
        }
    },
    nhi: {
        ten: 'Nhi khoa', icon: 'fa-child', mau: '#f59e0b',
        cham: 'Người nuôi kể bệnh, sinh — dinh dưỡng — chủng ngừa — phát triển',
        net: [
            'Người nuôi trẻ kể bệnh: bú, tiểu, phân, dịch tễ chung quanh',
            'Sản khoa lúc sinh, chủng ngừa, phát triển tâm thần vận động',
            'Tăng trưởng và phân độ suy dinh dưỡng theo tuổi',
            'Dịch truyền và liều thuốc tính theo cân nặng'
        ],
        nhan: {
            'legend:tiencan': 'IV. TIỀN CĂN — sản khoa lúc sinh, dinh dưỡng, chủng ngừa, phát triển',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — theo tuổi, kèm tăng trưởng',
            'label:exam-abdomen': '6. Bụng — gan lách, thóp'
        },
        ph: {
            'reason-for-admission': 'vd: Sốt cao 3 ngày, tiêu chảy nhiều lần',
            'exam-general': 'Tri giác, quấy khóc hay li bì, da niêm, thóp, dấu mất nước, thể trạng dinh dưỡng…',
            'exam-abdomen': 'Bụng mềm, gan lách dưới bờ sườn mấy cm, nhu động ruột, dấu mất nước…'
        }
    },
    cc: {
        ten: 'Cấp cứu', icon: 'fa-truck-medical', mau: '#dc2626',
        cham: 'Phân loại ưu tiên, ABCDE, đồng hồ vàng',
        net: [
            'Phân loại mức độ ưu tiên ngay lúc tiếp nhận',
            'Đánh giá ban đầu theo ABCDE trước khi khám chi tiết',
            'Đồng hồ vàng: giờ khởi phát → cửa sổ điều trị của từng bệnh cảnh',
            'qSOFA, xử trí ban đầu và hướng chuyển bệnh'
        ],
        nhan: {
            'legend:tiencan': 'IV. TIỀN CĂN — hỏi nhanh: thuốc, dị ứng, bệnh nền',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — ABCDE trước, chi tiết sau',
            'label:exam-abdomen': '6. Bụng'
        },
        ph: {
            'reason-for-admission': 'vd: Đau ngực dữ dội 1 giờ',
            'exam-general': 'Tri giác (GCS), da niêm, chi lạnh, CRT, dấu sốc, vết thương ngoài…',
            'exam-abdomen': 'Bụng chướng, phản ứng, dấu Blumberg, khối máu tụ thành bụng, vết thương…'
        }
    }
};

const LOAI = Object.keys(HO_SO);
const loaiHienTai = () => $('record-type')?.value || 'noi';

/* Gợi ý gõ gốc của từng ô — đổi khoa qua lại vẫn về đúng chữ ban đầu */
const phGoc = new Map();
function datPh(id, v) {
    const el = $(id);
    if (!el) return;
    if (!phGoc.has(id)) phGoc.set(id, el.placeholder || '');
    el.placeholder = v || phGoc.get(id);
}

/* Tìm <legend> theo id — trước đây dò theo chữ đầu dòng, nhưng chữ đó chính là
   thứ file này sửa, nên đổi số mục một lần là lần sau không tìm ra nữa. */
const LEGEND_ID = { 'legend:benhsu': 'lg-benhsu', 'legend:tiencan': 'lg-tiencan', 'legend:kham': 'lg-kham' };
const NHAN_KHOA = Object.keys(LEGEND_ID).concat(['label:exam-abdomen', 'label:contact-name', 'label:contact-phone']);
function timNhan(khoa) {
    if (khoa.startsWith('label:')) return document.querySelector(`label[for="${khoa.slice(6)}"]`);
    return $(LEGEND_ID[khoa]);
}

/* Nhãn gốc — cùng lý do với gợi ý gõ */
const nhanGoc = new Map();
function datNhan(khoa, chuMoi) {
    const el = timNhan(khoa);
    if (!el) return;
    // legend còn ôm mấy <span> ngày tháng bên trong: chỉ thay node chữ đầu tiên
    const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    if (!nhanGoc.has(el)) nhanGoc.set(el, node.textContent);
    node.textContent = chuMoi ? (chuMoi + ' ') : nhanGoc.get(el);
}

/* =====================================================================
   2. ÁP HỒ SƠ KHOA LÊN TRANG
   ===================================================================== */
/* ---------------------------------------------------------------------
   Bệnh án sản khoa xếp mục khác hẳn các khoa còn lại (Text 1.2):
     · TIỀN CĂN hỏi trước, BỆNH SỬ hỏi sau — vì phải biết PARA và tiền thai
       thì mới hỏi được thai kỳ lần này
     · PARA đứng ngay dòng hành chính, cạnh tuổi, không nằm dưới tiền căn
     · trong tiền căn thì tiền căn gia đình đứng đầu
   Chỉ DỜI node, không chép lại HTML: ô nào cũng giữ nguyên giá trị, sự kiện
   và id, nên phần lưu — chấm điểm — bản in không phải biết gì về chuyện này.
   --------------------------------------------------------------------- */
/* Thứ tự tiền căn của bệnh án sản khoa (Text 1.1):
   sản khoa → phụ khoa → kế hoạch gia đình → nội – ngoại khoa (kèm thuốc đang
   dùng, dị ứng, yếu tố xã hội – nhân khẩu) → gia đình.
   Ba mục sản – phụ – kế hoạch nằm chung trong #obgyne-box và đã xếp sẵn đúng
   thứ tự bên trong, nên ở đây chỉ cần xếp các hộp lớn. */
const TU_SAN = ['obgyne-box', 'tc-giadinh-box', 'tc-noikhoa-box', 'tc-thuoc-box',
    'tc-thoiquen-box', 'tc-diung-box', 'tc-ngoaikhoa-box', 'tc-moitruong-box'];
/* Bệnh sử sản khoa cũng có thứ tự riêng: kinh chót → định tuổi thai → tổng kết
   sổ khám thai, rồi mới tới lý do nhập viện lần này và diễn tiến khi nằm viện. */
const BS_SAN = ['bs-thaiky-box', 'bs-dinhtuoi-box', 'hx-san-park'];

const NOI_CU = new Map();
const nho = (el) => {
    if (el && !NOI_CU.has(el)) NOI_CU.set(el, { cha: el.parentNode, sau: el.nextSibling, thu: NOI_CU.size });
};
/* Trả về chỗ cũ theo thứ tự NGƯỢC: node đứng sau về trước thì cái mốc
   (nextSibling) của node đứng trước chắc chắn đã nằm đúng chỗ. */
function traVeHet() {
    [...NOI_CU.entries()].sort((a, b) => b[1].thu - a[1].thu)
        .forEach(([el, v]) => { if (v.cha) v.cha.insertBefore(el, v.sau); });
}

function sapXepMuc(laSan) {
    const benhSu = $('sec-benhsu'), tienCan = $('sec-tiencan'), para = $('para-box'),
        grid = $('hc-grid');
    [benhSu, tienCan, para, ...TU_SAN.map($), ...BS_SAN.map($)].forEach(nho);
    if (!laSan) {
        para?.classList.remove('col-span-2');
        traVeHet();
        return;
    }
    if (tienCan && benhSu && benhSu.parentNode) benhSu.parentNode.insertBefore(tienCan, benhSu);
    if (tienCan) {
        // Phải xếp BÊN TRONG cái hộp .flex.flex-col của mục, không phải ngay dưới
        // <legend> — nhấc ra ngoài hộp là mất luôn khoảng cách giữa các khối.
        const khung = tienCan.querySelector(':scope > div') || tienCan;
        let moc = null;
        TU_SAN.forEach(id => {
            const el = $(id);
            if (!el) return;
            if (moc) moc.after(el); else khung.insertBefore(el, khung.firstChild);
            moc = el;
        });
    }
    if (benhSu) {
        let m = $('hx-check') || benhSu.querySelector('legend');
        BS_SAN.forEach(id => { const el = $(id); if (el && m) { m.after(el); m = el; } });
    }
    if (para && grid) {
        para.classList.add('col-span-2');
        grid.insertBefore(para, $('patient-ethnicity')?.closest('div') || null);
    }
}

function apHoSo() {
    const t = loaiHienTai();
    const hs = HO_SO[t] || HO_SO.noi;

    document.body.dataset.khoa = t;
    sapXepMuc(t === 'san');
    document.documentElement.style.setProperty('--khoa-mau', hs.mau);

    // Nhãn và gợi ý gõ: trả tất cả về gốc trước, rồi mới đắp của khoa hiện tại
    NHAN_KHOA.forEach(k => datNhan(k, hs.nhan[k]));
    const moiPh = new Set(Object.keys(hs.ph));
    phGoc.forEach((_, id) => { if (!moiPh.has(id)) datPh(id, ''); });
    Object.entries(hs.ph).forEach(([id, v]) => datPh(id, v));
}

/* =====================================================================
   3. CỔNG CHỌN KHOA
   ===================================================================== */
let cong = null;
function dungCong() {
    if (cong) return cong;
    cong = document.createElement('div');
    cong.id = 'khoa-cong';
    cong.className = 'khoa-cong hidden';
    cong.innerHTML = `
        <div class="kc-bg"></div>
        <div class="kc-panel" role="dialog" aria-modal="true" aria-labelledby="kc-title">
            <h2 id="kc-title"><i class="fas fa-layer-group"></i> Bệnh án này thuộc khoa nào?</h2>
            <p class="kc-sub">Chọn trước rồi hãy gõ — mỗi khoa có bộ mục riêng, chọn xong trang mới bày đúng
                thứ cần hỏi và cần khám. Chọn nhầm vẫn đổi lại được bất cứ lúc nào.</p>
            <div class="kc-grid">${LOAI.map((k, i) => {
        const h = HO_SO[k];
        return `<button type="button" class="kc-card" data-k="${k}" style="--kc:${h.mau}">
                    <span class="kc-no">${i + 1}</span>
                    <span class="kc-ico"><i class="fas ${h.icon}"></i></span>
                    <span class="kc-ten">${esc(h.ten)}</span>
                    <ul class="kc-net">${h.net.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
                </button>`;
    }).join('')}</div>
            <p class="kc-foot"><a class="kc-mau" href="tao-benh-an.html?id=BA-MAU"><i
                class="fas fa-book-open-reader"></i> Chưa biết bắt đầu từ đâu? Xem bệnh án mẫu đã viết xong</a></p>
            <p class="kc-foot"><i class="fas fa-keyboard"></i> Bấm phím 1 – 5 để chọn nhanh.
                Thư mục đợt thực hành có ghi chuyên khoa thì lần sau trang tự chuyển, không hỏi nữa.</p>
        </div>`;
    document.body.appendChild(cong);
    cong.addEventListener('click', (e) => {
        const card = e.target.closest('[data-k]');
        if (card) chon(card.dataset.k);
    });
    return cong;
}

function moCong(doiLai) {
    const el = dungCong();
    el.classList.toggle('kc-doi', !!doiLai);
    el.classList.remove('hidden');
    document.body.classList.add('khoa-cong-mo');
    el.querySelector(`[data-k="${loaiHienTai()}"]`)?.focus({ preventScroll: true });
}

function dongCong() {
    cong?.classList.add('hidden');
    document.body.classList.remove('khoa-cong-mo');
}

function chon(k) {
    if (!HO_SO[k]) return;
    // Bấm hộ chip có sẵn: applyRecordType, openSpec, calcSpecialty, tự lưu đều nằm ở đó
    document.querySelector(`.type-chip[data-type="${k}"]`)?.click();
    dongCong();
    apHoSo();
    tinh();
}

/* Phím 1 – 5. Bắt ở pha capture để không đụng các phím tắt khác của trang;
   Escape cố tình KHÔNG đóng cổng — bệnh án mới thì buộc phải chọn khoa. */
addEventListener('keydown', (e) => {
    if (!cong || cong.classList.contains('hidden')) return;
    if (e.key === 'Escape' && !cong.classList.contains('kc-doi')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dongCong(); return; }
    const i = '12345'.indexOf(e.key);
    if (i >= 0) { e.preventDefault(); chon(LOAI[i]); }
}, true);

/* ---- Thư mục biết khoa thì khỏi hỏi ---------------------------------- */
function khoaCuaThuMuc() {
    const id = new URL(location.href).searchParams.get('folder');
    const f = id ? getFolder(id) : null;
    return f ? { f, k: folderSpec(f) } : null;
}

function bangThuMuc(f, k) {
    const head = document.querySelector('.page-card h2');
    if (!head || $('khoa-tu-thumuc')) return;
    const tag = document.createElement('div');
    tag.id = 'khoa-tu-thumuc';
    tag.className = 'khoa-tumuc';
    tag.innerHTML = `<i class="fas fa-folder-open"></i>
        <span>Thư mục <b>${esc(f.ten || 'đợt thực hành')}</b>${folderMeta(f) ? ' · ' + esc(folderMeta(f)) : ''}
        → đã chuyển sẵn sang bệnh án <b>${esc(HO_SO[k].ten)}</b>, không hỏi lại.</span>
        <button type="button" id="khoa-tumuc-doi">Đổi khoa</button>`;
    (($('folder-banner')) || head).insertAdjacentElement('afterend', tag);
    $('khoa-tumuc-doi').addEventListener('click', () => moCong(true));
}

/* =====================================================================
   4. MÁY TÍNH RIÊNG CỦA TỪNG KHOA
   ===================================================================== */
const ra = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const gio = (v) => { const d = new Date(v); return isNaN(d) ? null : d; };
const mocBenhAn = () => gio($('record-datetime')?.value) || new Date();
const cachGio = (tu, den) => (den - tu) / 3600000;

function ngayGio(h) {
    const ng = Math.floor(h / 24), g = Math.round(h % 24);
    return ng ? `${ng} ngày ${g} giờ` : `${h.toFixed(1)} giờ`;
}

/* ---- Ngoại: soi hội chứng từ các dấu chứng đã khám ------------------- */
function tinhNgoai() {
    const d = {
        diem: chu('sxk-diem'), pu: chu('sxk-phanung'), dk: chu('sxk-dekhang'),
        pm: chu('sxk-phucmac'), ng: chu('sxk-nghiem').toLowerCase(),
        go: chu('sxk-go'), nd: chu('sxk-nhudong')
    };
    const y = [];
    if (d.dk.includes('gỗ') || d.pm === 'dương tính' || d.pu.includes('lan tỏa'))
        y.push('Có hội chứng viêm phúc mạc — cần hội chẩn ngoại khoa ngay');
    if (d.go.includes('trước gan')) y.push('Mất vùng đục trước gan — nghĩ thủng tạng rỗng, chụp bụng đứng tìm liềm hơi');
    if (d.nd.includes('rắn bò')) y.push('Nhu động tăng kèm dấu rắn bò — hội chứng tắc ruột cơ học');
    if (d.nd.includes('mất nhu động')) y.push('Mất nhu động ruột — liệt ruột hoặc viêm phúc mạc giai đoạn muộn');
    if (d.go.includes('đục vùng thấp')) y.push('Gõ đục vùng thấp — có dịch ổ bụng, nghĩ xuất huyết nội nếu kèm sốc');
    if (d.ng.includes('murphy')) y.push('Murphy (+) — nghĩ viêm túi mật cấp');
    if (d.diem.includes('McBurney') && (d.ng.includes('blumberg') || d.ng.includes('rovsing')))
        y.push('Đau điểm McBurney kèm nghiệm pháp (+) — nghĩ viêm ruột thừa cấp');
    ra('sxk-out', y.length ? y.join(' · ')
        : 'Chọn các dấu chứng để máy soi hội chứng ngoại khoa (viêm phúc mạc, tắc ruột, xuất huyết nội…)');

    // Chuẩn bị mổ
    const pl = chu('sx-phanloai'), tc = chu('sx-tinhchat');
    const c = [];
    if (tc) c.push(tc === 'chưa có chỉ định mổ — điều trị nội' ? 'Chưa mổ — theo dõi và điều trị nội' : 'Cuộc mổ: ' + tc);
    if (pl === 'sạch') c.push('Vết mổ sạch — chỉ cần kháng sinh dự phòng một liều trước rạch da');
    if (pl === 'sạch – nhiễm') c.push('Vết mổ sạch – nhiễm — kháng sinh dự phòng, cân nhắc nhắc liều nếu mổ kéo dài');
    if (pl === 'nhiễm' || pl === 'bẩn') c.push('Vết mổ ' + pl + ' — đây là kháng sinh điều trị, không còn là dự phòng');
    if (tc.includes('cấp cứu') && chu('sx-camket') === 'chưa ký') c.push('Mổ cấp cứu mà chưa ký cam kết — nhớ hoàn tất hồ sơ');
    ra('sx-cb-out', c.length ? c.join(' · ')
        : 'Chọn tính chất cuộc mổ và phân loại vết mổ để máy nhắc kháng sinh dự phòng');

    // Hậu phẫu
    const mo = gio($('sx-datetime')?.value);
    const hp = [];
    if (mo) {
        const ng = Math.max(0, Math.floor(cachGio(mo, mocBenhAn()) / 24));
        hp.push(`Hậu phẫu ngày thứ ${ng}`);
        if (ng >= 3 && chu('hp-trungtien') === 'chưa trung tiện') hp.push('quá 3 ngày chưa trung tiện — coi chừng liệt ruột sau mổ');
    }
    const vm = chu('hp-vetmo');
    if (vm.includes('mủ') || vm.includes('hở') || vm.includes('toác')) hp.push('vết mổ có biến chứng — mô tả kỹ và ghi vào phần biến chứng');
    const cl = chu('hp-clavien');
    if (cl && !cl.startsWith('không')) hp.push('biến chứng ' + cl.split(' — ')[0]);
    ra('hp-out', hp.length ? hp.join(' · ') : 'Nhập ngày giờ mổ ở khối trên để máy tính hậu phẫu ngày thứ mấy');
}

/* ---- Sản ------------------------------------------------------------- */
function tinhSan() {
    // Leopold
    const l = [chu('ob-leo1'), chu('ob-leo2'), chu('ob-leo3'), chu('ob-leo4')];
    ra('ob-leo-out', l.filter(Boolean).length < 4
        ? 'Chọn đủ bốn thủ thuật để máy ghép thành câu khám bụng sản khoa'
        : leoCau());

    // Bishop
    const bs = ['ob-bs-mo', 'ob-bs-xoa', 'ob-bs-lot', 'ob-bs-mat', 'ob-bs-huong'].map(so);
    if (bs.every(v => v !== null)) {
        const d = bs.reduce((a, b) => a + b, 0);
        const y = d >= 8 ? 'cổ tử cung thuận lợi — khởi phát chuyển dạ nhiều khả năng thành công'
            : d >= 6 ? 'trung gian — cân nhắc làm chín muồi cổ tử cung'
                : 'cổ tử cung chưa thuận lợi — cần làm chín muồi trước khi khởi phát';
        ra('ob-bishop-out', `Bishop ${d}/13 điểm — ${y}`);
    } else ra('ob-bishop-out', 'Chọn đủ năm mục để máy tính điểm Bishop');

    // Chuyển dạ — ối
    const cd = [];
    const vo = gio($('ob-oi-gio')?.value);
    if (vo) {
        const h = cachGio(vo, mocBenhAn());
        cd.push(`Ối đã vỡ ${ngayGio(h)}`);
        if (h > 18) cd.push('trên 18 giờ — nguy cơ nhiễm trùng ối, cần kháng sinh và theo dõi sát');
    }
    const bd = gio($('ob-cd-batdau')?.value);
    if (bd) cd.push(`Chuyển dạ đã ${ngayGio(cachGio(bd, mocBenhAn()))}`);
    const co = so('ob-go-co'), nghiGiay = so('ob-go-nghi');
    // Bắt 3 cơn liên tiếp mới ra được chu kỳ cơn gò; có co và nghỉ thì khỏi đếm tay
    const chuKy = (co !== null && nghiGiay !== null && co + nghiGiay > 0) ? co + nghiGiay : null;
    const tan = so('ob-go-tan') ?? (chuKy ? Math.round(600 / chuKy) : null);
    if (tan !== null) cd.push(`Cơn gò ${tan} cơn trong 10 phút` + (tan >= 5 ? ' — cơn gò cường tính' : ''));
    if (chuKy) {
        cd.push(`mỗi cơn co ${co} giây, nghỉ ${nghiGiay} giây`);
        if (co > 60) cd.push('cơn co kéo dài trên 60 giây — coi chừng cơn gò cường tính');
        if (nghiGiay < 60) cd.push('nghỉ giữa hai cơn dưới 60 giây — tử cung không kịp hồi phục, nguy cơ suy thai');
    }
    const tt = so('ob-tt-cb');
    if (tt !== null) cd.push(tt < 110 ? 'Tim thai chậm dưới 110 l/p — thai suy'
        : tt > 160 ? 'Tim thai nhanh trên 160 l/p — tìm nguyên nhân (sốt mẹ, nhiễm trùng ối)'
            : 'Tim thai trong giới hạn bình thường');
    if (chu('ob-tt-nhom').startsWith('nhóm III')) cd.push('Biểu đồ tim thai nhóm III — bệnh lý, phải xử trí ngay');
    if (chu('ob-oi-mau').includes('phân su')) cd.push('Ối lẫn phân su — theo dõi thai suy');
    ra('ob-labor-out', cd.length ? cd.join(' · ') : 'Nhập thời điểm vỡ ối để máy tính ối đã vỡ bao lâu');

    // Tiền sản giật
    const bp = String($('vital-bp')?.value || '').match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    const tam = bp ? +bp[1] : null, truong = bp ? +bp[2] : null;
    const dam = chu('ob-tsg-dam'), nang = [];
    if (tam !== null && (tam >= 160 || truong >= 110)) nang.push('huyết áp ≥ 160/110 mmHg');
    if (chu('ob-tsg-dau') !== '' && chu('ob-tsg-dau') !== 'không') nang.push('nhức đầu hoặc rối loạn thị giác');
    if (chu('ob-tsg-bung') === 'có') nang.push('đau thượng vị – hạ sườn phải');
    if (chu('ob-tsg-pxgx').includes('rung giật')) nang.push('phản xạ gân xương tăng có rung giật');
    const nt = so('ob-tsg-nt');
    if (nt !== null && nt < 500) nang.push('thiểu niệu dưới 500 ml/24 giờ');
    let tsg = '';
    if (tam !== null && (tam >= 140 || truong >= 90)) {
        const coDam = dam && dam !== 'âm tính' && dam !== 'vết';
        tsg = coDam ? 'Tăng huyết áp kèm đạm niệu — hướng tới tiền sản giật'
            : 'Tăng huyết áp trong thai kỳ — cần định lượng đạm niệu';
        if (nang.length) tsg += `. CÓ DẤU HIỆU NẶNG: ${nang.join(', ')}`;
    } else if (nang.length) {
        tsg = 'Có dấu hiệu nặng (' + nang.join(', ') + ') — đo lại huyết áp ngay';
    }
    ra('ob-tsg-out', tsg || 'Máy lấy huyết áp ở phần sinh hiệu, cộng với các dấu hiệu trên để soi tiền sản giật có dấu hiệu nặng');

    // Hậu sản
    const hs = gio($('ob-hs-gio')?.value);
    const hsy = [];
    if (hs) hsy.push(`Hậu sản ngày thứ ${Math.max(0, Math.floor(cachGio(hs, mocBenhAn()) / 24))}`);
    const mau = so('ob-hs-mau'), cach = chu('ob-hs-cach');
    if (mau !== null) {
        const nguong = cach.includes('mổ lấy thai') ? 1000 : 500;
        if (mau >= nguong) hsy.push(`mất ${mau} ml máu — băng huyết sau sinh (ngưỡng ${nguong} ml)`);
    }
    ra('ob-hausan-out', hsy.length ? hsy.join(' · ') : 'Nhập ngày giờ sinh để máy tính hậu sản ngày thứ mấy');

    tinhTuoiThai();
    tinhTienCanSan();
    tinhKeHoach();
    tinhBangKiem();
    tinhLanMangThai();
    tinhXetNghiem();
    tinhKhungChau();
    tinhChanDoanSan();
    tinhSoKhamThai();
    tinhLichKhamThai();
    tinhOgtt();
    tinhTamSoat();
    tinhBienLuanSan();
}

/* ---------------------------------------------------------------------
   ĐỊNH TUỔI THAI — kinh chót, siêu âm, hỗ trợ sinh sản
   ---------------------------------------------------------------------
   Bốn nguồn, bốn cách tính khác nhau, nhưng quy hết về MỘT con số: ngày dự
   sinh. So hai ngày dự sinh với nhau là biết lệch mấy ngày, khỏi phải đổi
   tuần – ngày qua lại. Luật của bộ môn: siêu âm quý I lệch kinh chót trong
   vòng 5 ngày thì vẫn giữ kinh chót, quá 5 ngày mới lấy theo siêu âm SỚM NHẤT.
   --------------------------------------------------------------------- */
const NGAY = 86400000;
const dmy = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
const tuanNgay = (d) => `${Math.floor(d / 7)} tuần ${d % 7} ngày`;
const cachNgay = (a, b) => Math.round((b - a) / NGAY);
const ngayO = (id) => gio(String($(id)?.value || '').slice(0, 10));

/* Mỗi nguồn trả về: ngày dự sinh (mốc 40 tuần) + tuổi thai LÚC LÀM siêu âm —
   con số sau dùng để biết được phép hiệu chỉnh trong ngưỡng mấy ngày. */
function nguonTuoiThai() {
    const ref = ngayO('record-datetime') || new Date();
    const ds = [];
    const lmp = ngayO('ob-lmp');
    if (lmp) {
        const vong = so('ob-cycle') || 28;              // vòng kinh dài thì rụng trứng muộn
        ds.push({ loai: 'lmp', ten: 'kinh chót', edd: new Date(lmp.getTime() + (280 + vong - 28) * NGAY) });
    }
    const n1 = ngayO('ob-us1-ngay'), crl = so('ob-us1-crl');
    if (n1 && crl !== null) {
        if (crl < 10 || crl > 84) {
            ds.push({ loi: `CRL ${crl} mm ngoài khoảng 10 – 84 mm nên không dùng để định tuổi thai` });
        } else {
            // Tuổi thai (ngày vô kinh) = 42 + CRL (mm)
            const gaLuc = 42 + crl;
            ds.push({
                loai: 'crl', ten: 'siêu âm quý I (CRL)', ngay: n1, gaLuc,
                edd: new Date(n1.getTime() + (280 - gaLuc) * NGAY)
            });
            if (crl > 30) ds.push({ loi: 'CRL trên 30 mm: công thức 42 + CRL chỉ là tạm tính, nên tra bảng của Fetal Medicine Foundation cho chính xác' });
        }
    }
    const n2 = ngayO('ob-us2-ngay'), bpd = so('ob-us2-bpd');
    if (n2 && bpd !== null) {
        // Tuổi thai (tuần vô kinh) = ⅓ × (BPD – 17) + 11
        const gaLuc = Math.round(((bpd - 17) / 3 + 11) * 7);
        ds.push({
            loai: 'bpd', ten: 'siêu âm sau (BPD)', ngay: n2, gaLuc,
            edd: new Date(n2.getTime() + (280 - gaLuc) * NGAY)
        });
        if (gaLuc < 77 || gaLuc > 182) ds.push({ loi: `BPD ${bpd} mm cho tuổi thai ${tuanNgay(gaLuc)} — ngoài khoảng 11 – 26 tuần nên công thức BPD không còn đáng tin` });
    }
    if (so('ob-us2-hc') !== null) ds.push({ loi: 'Có số đo vòng đầu HC: máy không tự tính, tra bảng FMF (fetalmedicine.org) khi HC 100 – 280 mm' });

    const moc = chu('ob-phoi'), nMoc = ngayO('ob-phoi-ngay');
    if (moc && nMoc) {
        // phôi ngày 3 lúc chuyển đã 2 tuần 3 ngày, phôi ngày 5 là 2 tuần 5 ngày
        const tuoiLuc = moc.includes('ngày 3') ? 17 : moc.includes('ngày 5') ? 19 : 14;
        ds.push({
            loai: moc.includes('chuyển phôi') ? 'ivf' : 'noan', ten: moc, gaLuc: tuoiLuc,
            edd: new Date(nMoc.getTime() + (280 - tuoiLuc) * NGAY)
        });
    }
    return { ref, ds };
}

/* Kinh chót chỉ được dùng làm mốc "0" khi thai phụ nhớ rõ ngày, chu kỳ đều và
   dài 26 – 30 ngày, lần hành kinh cuối giống hệt các kỳ bình thường, không dùng
   nội tiết trong chu kỳ có thai. Không thỏa thì phải đi tìm "ngày kinh cuối lí
   thuyết" từ siêu âm. */
function kinhChotTinCay() {
    if (!$('ob-lmp')?.value) return { ok: false, ly: ['chưa có ngày kinh chót'] };
    const ly = [];
    const vong = so('ob-cycle'), kieu = chu('ob-cycle-type'), tc = chu('ob-lmp-tc');
    if (vong !== null && (vong < 26 || vong > 30)) ly.push(`vòng kinh ${vong} ngày, ngoài khoảng 26 – 30 ngày`);
    if (/không đều|thưa|ngắn/i.test(kieu)) ly.push('chu kỳ kinh không đều');
    if (tc && tc !== 'giống hệt các kỳ kinh bình thường') ly.push(`kỳ kinh chót ${tc}`);
    if (/kích thích phóng noãn|IVF|IUI/i.test(chu('ob-tc-thuthai'))) ly.push('chu kỳ có can thiệp nội tiết — hỗ trợ sinh sản');
    return { ok: !ly.length, ly };
}

function chotTuoiThai() {
    const { ref, ds } = nguonTuoiThai();
    const co = ds.filter(x => x.edd);
    const loi = ds.filter(x => x.loi).map(x => x.loi);
    const ket = (chon, vi) => ({ ref, co, loi, chon, vi, days: 280 + cachNgay(chon.edd, ref) });
    if (!co.length) return { ref, co, loi, chon: null };

    const lmp = co.find(x => x.loai === 'lmp');
    const crl = co.find(x => x.loai === 'crl');
    const bpd = co.find(x => x.loai === 'bpd');
    const ivf = co.find(x => x.loai === 'ivf');
    const noan = co.find(x => x.loai === 'noan');

    // Sinh viên chốt tay ở ô "Tuổi thai tính theo" thì nghe theo
    const tay = chu('ob-ga-nguon');
    const theoTay = tay && co.find(x => tay === 'kinh chót' ? x.loai === 'lmp'
        : tay === 'siêu âm quý I' ? x.loai === 'crl' : (x.loai === 'ivf' || x.loai === 'noan'));
    if (theoTay) return ket(theoTay, 'nguồn do người làm bệnh án tự chốt');

    // 1. Chuyển phôi IVF: tuổi thai đã khẳng định, KHÔNG hiệu chỉnh bằng gì khác
    if (ivf) {
        const sa = crl || bpd;
        const lech = sa ? Math.abs(cachNgay(ivf.edd, sa.edd)) : 0;
        return ket(ivf, 'thai từ chuyển phôi IVF nên tuổi thai đã được khẳng định, không hiệu chỉnh bằng siêu âm hay kinh chót'
            + (lech > 7 ? ` · siêu âm lệch ${lech} ngày — nghĩ tới thai phát triển bất thường chứ không sửa tuổi thai` : ''));
    }
    // 2. Canh ngày phóng noãn: quy về kinh chót, mốc phóng noãn là 2 tuần tuổi thai
    const mocLam = lmp || noan;
    if (!mocLam) {
        const sa = crl || bpd;
        return ket(sa, 'không có kinh chót — lấy ngày kinh cuối lí thuyết từ siêu âm');
    }
    const tin = lmp ? kinhChotTinCay() : { ok: true, ly: [] };

    // 3. Kinh chót không tin cậy: bắt buộc lấy mốc "0" giả định từ siêu âm
    if (!tin.ok) {
        const sa = crl || bpd;
        if (!sa) return ket(mocLam, `kinh chót kém tin cậy (${tin.ly.join(', ')}) mà chưa có siêu âm định tuổi thai — cần siêu âm để lấy ngày kinh cuối lí thuyết`);
        return ket(sa, `kinh chót kém tin cậy (${tin.ly.join(', ')}) — định tuổi thai theo siêu âm, lấy ngày kinh cuối lí thuyết`);
    }

    // 4. Kinh chót tin cậy: siêu âm chỉ để KIỂM CHỨNG, ngưỡng hiệu chỉnh tùy
    //    tuổi thai lúc làm siêu âm — dưới 9 tuần lệch quá 5 ngày, từ 9 tuần đến
    //    13 tuần 6 ngày lệch quá 7 ngày thì mới đổi sang siêu âm.
    if (crl) {
        const lech = Math.abs(cachNgay(mocLam.edd, crl.edd));
        if (crl.gaLuc > 97) return ket(mocLam, `siêu âm làm lúc thai ${tuanNgay(crl.gaLuc)}, đã qua 13 tuần 6 ngày nên không dùng để hiệu chỉnh — giữ tuổi thai theo kinh chót (lệch ${lech} ngày)`);
        const nguong = crl.gaLuc < 63 ? 5 : 7;
        return lech <= nguong
            ? ket(mocLam, `siêu âm lúc thai ${tuanNgay(crl.gaLuc)} lệch ${lech} ngày, trong ngưỡng ${nguong} ngày — giữ tuổi thai theo kinh chót`)
            : ket(crl, `siêu âm lúc thai ${tuanNgay(crl.gaLuc)} lệch ${lech} ngày, quá ngưỡng ${nguong} ngày — hiệu chỉnh theo siêu âm`);
    }
    if (bpd) return ket(mocLam, 'chỉ có BPD: đường kính lưỡng đỉnh chỉ dùng khi không có CRL hợp lệ, nên vẫn giữ tuổi thai theo kinh chót');
    return ket(mocLam, 'chưa có siêu âm quý I để kiểm chứng — tuổi thai đang là số tạm tính theo kinh chót');
}

function cauTuoiThai(ngan) {
    const t = chotTuoiThai();
    if (!t.chon || t.days < 0 || t.days > 320) return '';
    // Câu chẩn đoán theo mẫu bộ môn chỉ cần "thai … tuần (theo …)" — ngày dự sinh
    // đã nằm ở phần tiền căn rồi, nhắc lại chỉ làm dài dòng.
    return ngan ? `thai ${tuanNgay(t.days)} (theo ${t.chon.ten.replace(/\s*\(.*\)$/, '')})`
        : `thai ${tuanNgay(t.days)} theo ${t.chon.ten}, dự sinh ${dmy(t.chon.edd)}`;
}

function tinhTuoiThai() {
    const t = chotTuoiThai();
    const y = [];
    if (t.chon) {
        y.push(`Tuổi thai ${tuanNgay(t.days)} — dự sinh ${dmy(t.chon.edd)} (theo ${t.chon.ten})`);
        if (t.chon.loai !== 'lmp') {
            const ly = new Date(t.chon.edd.getTime() - 280 * NGAY);
            y.push(`ngày kinh cuối lí thuyết ${dmy(ly)}`);
        }
        if (t.vi) y.push(t.vi);
        const khac = t.co.filter(x => x !== t.chon).map(x => `${x.ten} → ${dmy(x.edd)}`);
        if (khac.length) y.push('các nguồn còn lại: ' + khac.join(', '));
        if (t.days > 294) y.push('THAI QUÁ NGÀY DỰ SINH trên 42 tuần — xem lại cách tính và có hướng chấm dứt thai kỳ');
        if (t.days > 97 && !t.co.some(x => x.loai === 'crl' || x.loai === 'ivf'))
            y.push('đã qua tam cá nguyệt I mà chưa có mốc tin cậy nào — theo bộ môn thì việc định tuổi thai lẽ ra phải hoàn tất trước 13 tuần 6 ngày');
    }
    y.push(...t.loi);
    if ($('ob-lmp')?.value && !$('ob-lmp2')?.value)
        y.push('chưa ghi kinh áp chót — hỏi thêm để chắc lần ra huyết vừa rồi đúng là kinh chót');
    ra('ob-ga-out', y.length ? y.join(' · ')
        : 'Nhập CRL, BPD hoặc ngày chuyển phôi để máy đối chiếu với kinh chót rồi chốt ngày dự sinh');
}

/* ---- Kế hoạch gia đình: tránh thai, bỏ thai -------------------------- */
function tinhKeHoach() {
    const pt = chu('ob-kh-phathai'), pp = chu('ob-kh-pp'), bc = chu('ob-kh-bienchung');
    const y = [];
    if (/2 lần|3 lần trở lên/.test(pt))
        y.push('bỏ thai nhiều lần — hỏi kỹ có can thiệp buồng tử cung không, nguy cơ dính buồng tử cung và nhau bám bất thường');
    if (/nạo|hút thai/.test(pp)) y.push('có can thiệp lòng tử cung — coi chừng nhau tiền đạo, nhau cài răng lược ở thai kỳ này');
    if (bc && !bc.startsWith('không')) y.push('lần trước có tai biến: ' + bc + ' — phải chuẩn bị trước cho cuộc sinh lần này');
    if (chu('ob-kh-lydo').match(/dị tật/i)) y.push('từng chấm dứt thai kỳ vì dị tật — nhớ soi lại sàng lọc quý I và hình thái học lần này');
    ra('ob-kh-out', y.length ? y.join(' · ')
        : 'Điền để máy ghép câu kế hoạch gia đình và soi nguy cơ của các lần can thiệp buồng tử cung');
}

/* ---- Khám bụng sản khoa: nhìn · sờ · nghe ---------------------------- */
function cauKhamBung() {
    const p = [];
    const g = (id, truoc = '', sau = '') => { const v = chu(id); if (v) p.push(truoc + v + sau); };
    g('ob-nhin'); g('ob-randa'); g('ob-seo'); g('ob-seo-mota'); g('ob-seo-dinh');
    const bc = so('ob-bctc'), vb = so('ob-vb');
    if (bc !== null) p.push(`bề cao tử cung ${bc} cm`);
    if (vb !== null) p.push(`vòng bụng ${vb} cm`);
    if (bc !== null && vb !== null) p.push(`ước lượng cân thai ${Math.round((bc + vb) * 100 / 4)} g`);
    g('ob-contraction', 'cơn gò ');
    const co = so('ob-go-co'), nghiGiay = so('ob-go-nghi');
    if (co !== null && nghiGiay !== null) p.push(`bắt 3 cơn liên tiếp: co ${co} giây, nghỉ ${nghiGiay} giây`);
    const tt = so('ob-fhr');
    if (tt !== null) p.push(`tim thai ${tt} lần/phút`);
    g('ob-tt-vitri', 'nghe rõ nhất ở '); g('ob-tt-nhipdieu');
    return p.length ? 'Khám bụng sản khoa: ' + p.join(', ') + '.' : '';
}

/* ---- Tóm tắt bệnh án sản khoa theo mẫu bộ môn ------------------------ */
function cauTomTat() {
    const tuoi = so('patient-age');
    const para = ['para-1', 'para-2', 'para-3', 'para-4'].map(id => so(id) ?? 0);
    const coPara = ['para-1', 'para-2', 'para-3', 'para-4'].some(id => chu(id));
    const lyDo = chu('reason-for-admission');
    const mo = [`Sản phụ${tuoi !== null ? ' ' + tuoi + ' tuổi' : ''}`,
    coPara ? 'PARA ' + para.join('') : '', conSoRa()].filter(Boolean).join(', ');
    const cau = [mo + (lyDo ? `, nhập viện vì ${lyDo.toLowerCase()}` : '') + '.'];

    const kham = [cauTuoiThai(true), chu('ob-sothai'),
    chu('ob-position') && 'ngôi ' + chu('ob-position').replace(/^ngôi\s+/i, ''),
    chu('ob-the') && 'kiểu thế ' + chu('ob-the'), chu('ob-cd-gd')].filter(Boolean);
    if (kham.length) cau.push('Qua hỏi bệnh và thăm khám ghi nhận: ' + kham.join(', ') + '.');

    const quan = [];
    const vo = gio($('ob-oi-gio')?.value);
    if (vo) quan.push(`ối vỡ giờ thứ ${Math.max(0, Math.round(cachGio(vo, mocBenhAn())))}`);
    if (chu('ob-oi-mau').includes('phân su')) quan.push('ối lẫn phân su');
    // Mấy ô kết quả khi chưa có dữ liệu vẫn in một dòng gợi ý — dòng đó cũng chứa
    // chữ "hẹp", "tiền sản giật". Chỉ nhận khi ĐÚNG là câu kết luận máy chấm ra.
    const kc = $('ob-kc-out')?.textContent || '';
    if (/^Có dấu hiệu hẹp/.test(kc)) quan.push('khung chậu nghi hẹp');
    else if (/^Ba eo không có/.test(kc)) quan.push('khung chậu bình thường');
    const tsg = $('ob-tsg-out')?.textContent || '';
    if (/^(Tăng huyết áp|Có dấu hiệu nặng)/.test(tsg)) quan.push(tsg.split('.')[0].toLowerCase());
    if (chu('ob-tt-nhom').startsWith('nhóm III')) quan.push('biểu đồ tim thai nhóm III');
    const noi = chu('history-internal');
    if (noi && !/chưa ghi nhận/i.test(noi)) quan.push('tiền căn nội khoa: ' + noi.split('\n')[0]);
    if (quan.length) cau.push('Triệu chứng — vấn đề quan trọng kèm theo: ' + quan.join(', ') + '.');
    return cau.join(' ');
}

/* ---- Tiền căn sản khoa: hiếm muộn, vết mổ cũ ------------------------- */
function tinhTienCanSan() {
    const y = [];
    /* Tổng số lần mang thai (gravida) phải khớp T + P + A, cộng thêm thai lần
       này nếu đang mang thai — lệch là dấu hiệu khai sót một lần thai. */
    const g = so('ob-tc-gravida');
    if (g !== null) {
        const tpa = ['para-1', 'para-2', 'para-3'].reduce((t, id) => t + (so(id) || 0), 0);
        const dangThai = !!$('ob-lmp')?.value || !!chu('ob-cd-gd') || !!chu('ob-sothai');
        const canCo = tpa + (dangThai ? 1 : 0);
        if (g !== canCo) y.push(`tổng ${g} lần mang thai nhưng PARA cộng lại${dangThai ? ' kèm thai lần này' : ''} chỉ ${canCo} — còn lần thai nào chưa khai?`);
    }
    const nam = so('ob-tc-kethon'), thu = chu('ob-tc-thuthai'), kh = chu('ob-tc-kehoach');
    const daSinh = ['para-1', 'para-2', 'para-3'].reduce((a, id) => a + (so(id) || 0), 0);
    if (nam && !daSinh) {
        const cach = new Date().getFullYear() - nam;
        if (cach >= 2) y.push(`lập gia đình ${cach} năm mới có thai lần đầu — có yếu tố hiếm muộn, thai kỳ này là thai quý`);
    }
    if (/IUI|IVF/.test(thu) || kh.includes('hiếm muộn'))
        y.push('thai có hỗ trợ sinh sản — biết chính xác ngày phôi nên tuổi thai lấy theo mốc đó, và cân nhắc kỹ khi chọn cách sinh');
    if (kh === 'ngoài kế hoạch') y.push('thai ngoài kế hoạch — hỏi thêm biện pháp tránh thai đang dùng và thái độ với thai kỳ');
    const mo = chu('ob-tc-mophukhoa') + ' ' + chu('ob-tc-mobung');
    if (/khoét chóp|LEEP/i.test(mo)) y.push('có khoét chóp cổ tử cung — nguy cơ hở eo tử cung, sinh non');
    if (/u xơ|bóc u/i.test(mo)) y.push('có bóc u xơ tử cung — sẹo thân tử cung, cân nhắc mổ lấy thai chủ động');
    if (/chấn thương|gãy khung chậu|bại liệt/i.test(mo)) y.push('có chấn thương khung chậu — phải khám khung chậu kỹ trước khi tiên lượng sinh ngả âm đạo');
    ra('ob-tc-out', y.length ? y.join(' · ')
        : 'Điền để máy ghép câu tiền căn và soi các yếu tố nguy cơ: hiếm muộn, vết mổ cũ, khung chậu');
}

/* ---- Bảng kiểm tiền sử gia đình & nội khoa (NK 2019) ------------------ */
const GD_KIEM = [['obgd-ditruyen', 'bệnh di truyền (đái tháo đường, tim mạch, cao huyết áp, thiếu máu, chuyển hóa)'],
['obgd-laycheo', 'người sống chung mắc bệnh truyền nhiễm (lao, cúm)'],
['obgd-ditat', 'người thân trực hệ dị tật bẩm sinh — chậm phát triển'],
['obgd-ungthu', 'ung thư vú — ung thư buồng trứng ở người thân trực hệ'],
['obgd-dathai', 'gia đình có người sinh đa thai']];

const NK_KIEM = [['obnk-nointiet', 'nội tiết'], ['obnk-timmach', 'tim mạch'], ['obnk-hohap', 'hô hấp'],
['obnk-ganmat', 'gan – mật'], ['obnk-than', 'thận – tiết niệu'], ['obnk-tumien', 'tự miễn'],
['obnk-thankinh', 'tâm thần – thần kinh'], ['obnk-hiv', 'HIV'], ['obnk-truyenmau', 'truyền máu gần đây'],
['obnk-thuoc', 'thuốc đang dùng — thuốc lá']];

const daTich = (ds) => ds.filter(([id]) => $(id)?.checked).map(([, t]) => t);

function soiKiem(ds, idDaHoi, idOut, ten) {
    const co = daTich(ds);
    const daHoi = $(idDaHoi)?.checked;
    const y = [];
    if (co.length) y.push('Ghi nhận: ' + co.join(', '));
    if (daHoi) y.push(`đã hỏi đủ ${ds.length} ý của bảng kiểm, các ý còn lại không ghi nhận`);
    else y.push(`chưa xác nhận đã hỏi đủ — bảng kiểm ${ten} có ${ds.length} ý, tích dòng cuối khi hỏi xong`);
    ra(idOut, y.join(' · '));
}

function tinhBangKiem() {
    soiKiem(GD_KIEM, 'obgd-dahoi', 'ob-gd-out', 'tiền sử gia đình');
    soiKiem(NK_KIEM, 'obnk-dahoi', 'ob-nk-out', 'tiền sử nội khoa');
}

/* ---- Chi tiết một lần mang thai trước -------------------------------- */
const O_MOT_LAN = ['ob-lan-nam', 'ob-lan-ketcuc', 'ob-lan-tuoithai', 'ob-lan-sothai', 'ob-lan-noi',
    'ob-lan-cachsinh', 'ob-lan-lydo', 'ob-lan-can', 'ob-lan-hinhthai', 'ob-lan-taibien',
    'ob-lan-hausan', 'ob-lan-connay'];

function cauLanMangThai() {
    const p = [];
    const g = (id, truoc = '', sau = '') => { const v = chu(id); if (v) p.push(truoc + v + sau); };
    g('ob-lan-ketcuc'); g('ob-lan-tuoithai', 'tuổi thai '); g('ob-lan-sothai');
    g('ob-lan-noi', 'tại '); g('ob-lan-cachsinh'); g('ob-lan-lydo', 'lý do ');
    g('ob-lan-can', 'bé cân nặng ', ' g'); g('ob-lan-hinhthai');
    g('ob-lan-taibien', 'tai biến: '); g('ob-lan-hausan'); g('ob-lan-connay', 'hiện nay ');
    const nam = chu('ob-lan-nam');
    if (!nam && !p.length) return '';
    return (nam || 'không rõ năm') + ' — ' + (p.length ? p.join(', ') : 'chưa ghi chi tiết');
}

function tinhLanMangThai() {
    const cau = cauLanMangThai();
    ra('ob-lan-out', cau || 'Điền các ô trên — máy ghép thành một dòng đúng thứ tự bảng kiểm rồi thêm vào danh sách phía trên');
}

/* =====================================================================
   SỔ KHÁM THAI — tổng kết theo mốc khám
   ---------------------------------------------------------------------
   Bảng tổng kết sổ khám thai là thứ bộ môn chấm nặng nhất ở bệnh án sản:
   nhìn một dòng phải thấy được thai lúc đó bao nhiêu tuần, mẹ thế nào, thai
   thế nào, lần khám đó kết luận gì. Người làm bệnh án chỉ nhập NGÀY KHÁM —
   tuổi thai lúc đó máy quy ngược từ ngày dự sinh đã chốt, nên không còn cảnh
   mỗi dòng một cách tính.
   ===================================================================== */
/* Một lần khám = một dòng, các trường ngăn nhau bằng "|" theo ĐÚNG thứ tự
   dưới đây. Lưu từng trường riêng (chứ không phải câu văn ghép sẵn) để bảng
   sửa lại được và để máy còn tính bách phân vị, Doppler. */
const SK_F = [
    ['ngay', 'Ngày khám', 'date', ''],
    ['can', 'Cân nặng (kg)', 'number', '60'],
    ['ha', 'Huyết áp', 'text', '110/70'],
    ['bctc', 'BCTC (cm)', 'number', '29'],
    ['tt', 'Tim thai', 'number', '145'],
    ['efw', 'EFW (g)', 'number', '1538'],
    ['bpv', 'EFW bách phân vị', 'number', '6'],
    ['uapi', 'UA PI', 'number', '1.04'],
    ['mcapi', 'MCA PI', 'number', '2.36'],
    ['nhandinh', 'Nhận định – xử trí', 'text', 'thai nhỏ so với tuổi thai'],
    /* --- các trường dưới đây nằm trong hàng chi tiết (bấm ⌄ mới hiện) --- */
    ['noi', 'Nơi khám', 'text', 'BV Từ Dũ'],
    ['ac', 'AC (mm)', 'number', '244'],
    ['acbpv', 'AC bách phân vị', 'number', '11'],
    ['afi', 'AFI (cm)', 'number', '12'],
    ['sdp', 'Xoang ối lớn nhất (cm)', 'number', '4.3'],
    ['cl', 'Kênh cổ tử cung (mm)', 'number', '37'],
    ['nhau', 'Vị trí nhau – độ trưởng thành', 'text', 'mặt sau nhóm II'],
    ['uabpv', 'UA PI bách phân vị', 'number', '70'],
    ['cpr', 'CPR', 'number', '2.6'],
    ['cprbpv', 'CPR bách phân vị', 'number', '92'],
    ['utapi', 'UtA PI trung bình', 'number', '0.8'],
    ['ctt', 'Sóng cuối tâm trương ĐM rốn', 'select', ''],
    ['xn', 'Xét nghiệm – tầm soát lần này', 'text', 'OGTT 75 g âm tính']
];
const SK_CHINH = 10;                       // mười trường đầu nằm trên hàng chính
const SK_CTT = ['', 'còn sóng cuối tâm trương', 'mất sóng cuối tâm trương (AEDF)',
    'đảo ngược sóng cuối tâm trương (REDF)'];

/** Đọc sổ khám thai từ ô lưu thành mảng đối tượng */
function docSo() {
    return String($('ob-sokham')?.value || '').split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => {
            const p = l.split('|').map(x => x.trim());
            const r = {};
            SK_F.forEach(([k], i) => { r[k] = p[i] || ''; });
            return r;
        });
}

/** Một lần khám thành một dòng. Hàng chưa điền gì vẫn phải để lại dấu "|",
    không thì dòng rỗng và docSo() lọc mất ngay hàng vừa thêm. */
const dongSo = (r) => (SK_F.map(([k]) => r[k] || '').join(' | ').replace(/[\s|]+$/, '') || '|');

/** Ghi mảng trở lại ô lưu, xếp theo ngày khám */
function ghiSo(ds) {
    const el = $('ob-sokham');
    if (!el) return;
    ds.sort((a, b) => (a.ngay || '9999').localeCompare(b.ngay || '9999'));
    el.value = ds.map(dongSo).join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Tuổi thai (ngày) tại một mốc bất kỳ, suy ngược từ ngày dự sinh đã chốt */
function tuoiThaiLuc(d) {
    const t = chotTuoiThai();
    if (!t.chon || !d) return null;
    const ngay = 280 - cachNgay(d, t.chon.edd);
    return (ngay >= 0 && ngay <= 320) ? ngay : null;
}

/** Tỉ số não/rốn: nhập tay thì lấy tay, không thì tự chia MCA PI cho UA PI */
function cprCua(r) {
    const tay = parseFloat(r.cpr);
    if (isFinite(tay)) return tay;
    const mca = parseFloat(r.mcapi), ua = parseFloat(r.uapi);
    return (isFinite(mca) && isFinite(ua) && ua) ? mca / ua : null;
}

/**
 * Soi một lần khám theo đồng thuận Delphi – FIGO.
 * Ngưỡng đổi theo tuổi thai: dưới 32 tuần là FGR sớm, từ 32 tuần là FGR muộn.
 * Chưa đủ tiêu chuẩn mà thai vẫn nhỏ thì chỉ được gọi SGA — đây đúng là chỗ
 * sinh viên hay kết luận vội và bị hỏi vặn.
 */
function soiTangTruong(r, ngayGA) {
    const num = (k) => { const v = parseFloat(r[k]); return isFinite(v) ? v : null; };
    const nho = [num('bpv'), num('acbpv')].filter(v => v !== null);
    if (!nho.length) return '';
    const min = Math.min(...nho);
    const ctt = r.ctt || '';
    const uabpv = num('uabpv'), cprbpv = num('cprbpv'), utapi = num('utapi');
    const som = ngayGA === null ? null : ngayGA < 224;   // 32 tuần = 224 ngày
    const ten = som === null ? '' : som ? ' sớm' : ' muộn';

    if (ctt.includes('mất sóng') || ctt.includes('đảo ngược')) return `FGR${ten} — ${ctt}`;
    if (min < 3) return `FGR${ten} — bách phân vị ${min} dưới ngưỡng 3`;
    if (min >= 10) return `bách phân vị ${min} — trong giới hạn bình thường`;

    // Bách phân vị 3 – 10: phải có thêm bằng chứng huyết động mới được gọi FGR
    const them = [];
    if (uabpv !== null && uabpv > 95) them.push('UA PI trên bách phân vị 95');
    if (cprbpv !== null && cprbpv < 5) them.push('CPR dưới bách phân vị 5');
    if (som && utapi !== null && utapi > 1.5) them.push('UtA PI tăng trở kháng');
    return them.length
        ? `FGR${ten} — bách phân vị ${min} kèm ${them.join(', ')}`
        : `SGA — bách phân vị ${min}, Doppler chưa thỏa tiêu chuẩn FGR`;
}

/* ---- Bảng nhập trực tiếp -------------------------------------------- */
const skMo = new Set();                    // chỉ số các hàng đang mở chi tiết
let skDaVe = null;
let skDangGo = false;                      // đang gõ trong bảng -> cấm vẽ lại

function oNhap(i, k, v, ph, kieu) {
    const at = `data-i="${i}" data-k="${k}" class="sk-in"`;
    if (kieu === 'select')
        return `<select ${at}>${SK_CTT.map(o =>
            `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    return `<input type="${kieu}" ${at} value="${esc(v)}"`
        + (kieu === 'number' ? ' step="any"' : '') + ` placeholder="${esc(ph)}">`;
}

/**
 * Vẽ lại bảng từ chính ô lưu — không giữ mảng riêng, nên sửa tay trong ô thô
 * là bảng đổi theo và không phải đồng bộ hai nguồn dữ liệu.
 */
function veBangSoKham() {
    const hop = $('ob-sk-wrap');
    if (!hop) return;
    // Đang gõ trong chính bảng thì tuyệt đối không dựng lại: innerHTML mới là
    // mất con trỏ giữa chừng. Dùng cờ chứ không dùng document.activeElement —
    // trong khung không được focus (và khi chụp ảnh tự động) activeElement trả
    // về body, guard coi như không có.
    if (skDangGo) return;
    const raw = String($('ob-sokham')?.value || '');
    // tinh() chạy mỗi lần gõ phím; dựng lại bảng khi nội dung không đổi là phí.
    const dau = raw + '#' + [...skMo].sort().join(',');
    if (dau === skDaVe) return;
    skDaVe = dau;

    const ds = docSo();
    if (!ds.length) {
        hop.innerHTML = '<p class="sk-trong">Chưa có lần khám nào — bấm “Thêm lần khám” để mở hàng đầu tiên.</p>';
        return;
    }
    const dong = ds.map((r, i) => {
        const ga = tuoiThaiLuc(gio(r.ngay));
        const soi = soiTangTruong(r, ga);
        const o = SK_F.slice(0, SK_CHINH).map(([k, , kieu, ph]) =>
            `<td class="sk-c-${k}">${oNhap(i, k, r[k], ph, kieu)}</td>`).join('');
        const mo = skMo.has(i);
        const chinh = `<tr class="sk-row"><td class="sk-ga">${ga === null ? '—' : tuanNgay(ga)}</td>${o}`
            + `<td class="sk-x"><button type="button" class="sk-more" data-i="${i}" title="Thông số chi tiết">`
            + `<i class="fas fa-chevron-${mo ? 'up' : 'down'}"></i></button>`
            + `<button type="button" class="sk-del" data-i="${i}" title="Xóa lần khám này"><i class="fas fa-xmark"></i></button></td></tr>`;
        const soiTr = soi ? `<tr class="sk-soi"><td></td><td colspan="${SK_CHINH + 1}">⟶ ${esc(soi)}</td></tr>` : '';
        if (!mo) return chinh + soiTr;
        const phu = SK_F.slice(SK_CHINH).map(([k, nhan, kieu, ph]) =>
            `<label class="sk-ph"><span>${esc(nhan)}</span>${oNhap(i, k, r[k], ph, kieu)}</label>`).join('');
        return chinh + soiTr
            + `<tr class="sk-chitiet"><td></td><td colspan="${SK_CHINH + 1}"><div class="sk-ph-grid">${phu}</div></td></tr>`;
    }).join('');

    hop.innerHTML = '<div class="sk-scroll"><table class="sk-tb"><thead><tr><th>Tuổi thai</th>'
        + SK_F.slice(0, SK_CHINH).map(([, nhan]) => `<th>${esc(nhan)}</th>`).join('')
        + '<th></th></tr></thead><tbody>' + dong + '</tbody></table></div>';
}

/** Xu hướng tăng trưởng qua các lần khám */
function tinhSoKhamThai() {
    veBangSoKham();
    const ds = docSo();
    const moc = ds.map(r => ({ ga: tuoiThaiLuc(gio(r.ngay)), bpv: parseFloat(r.bpv) }))
        .filter(x => x.ga !== null && isFinite(x.bpv));
    if (moc.length < 2) {
        ra('ob-kt-xu', ds.length
            ? `Sổ khám thai đang có ${ds.length} lần khám — cần từ hai lần có bách phân vị trở lên để máy nhận xét xu hướng tăng trưởng`
            : 'Thêm từ hai lần khám có bách phân vị trở lên để máy nhận xét xu hướng tăng trưởng của thai');
        return;
    }
    moc.sort((a, b) => a.ga - b.ga);
    const d0 = moc[0], dn = moc[moc.length - 1];
    const lech = dn.bpv - d0.bpv;
    // Ngưỡng 10 điểm bách phân vị chỉ hợp ở vùng giữa. Thai đang nằm dưới bách
    // phân vị 10 thì tụt 2 điểm cũng đáng nói, nên xét riêng vùng thấp.
    const y = lech <= -10 ? 'biểu đồ đi xuống rõ — thai đang tụt bách phân vị, phải phân định thai nhỏ thể tạng với thai giới hạn tăng trưởng'
        : lech >= 10 ? 'biểu đồ đi lên — thai bắt kịp đà tăng trưởng'
            : 'biểu đồ đi ngang — thai giữ nguyên đường bách phân vị của nó';
    const them = dn.bpv < 3 ? ' ⚠ lần gần nhất dưới bách phân vị 3 — đủ tiêu chuẩn thai giới hạn tăng trưởng, không còn là thai nhỏ đơn thuần'
        : dn.bpv < 10 ? ' ⚠ lần gần nhất vẫn dưới bách phân vị 10 — phải có Doppler động mạch rốn và não giữa mới phân định được thai nhỏ thể tạng với thai giới hạn tăng trưởng'
            : '';
    ra('ob-kt-xu', `${ds.length} lần khám · bách phân vị ${d0.bpv} lúc ${tuanNgay(d0.ga)} → ${dn.bpv} lúc ${tuanNgay(dn.ga)}: ${y}${them}`);
}

/** Một lần khám ghép thành câu văn — dùng cho ô tam cá nguyệt và bản in */
function cauLanKham(r) {
    const d = gio(r.ngay);
    const ga = tuoiThaiLuc(d);
    const me = [], thai = [], dop = [], cuoi = [];
    const g = (kho, k, truoc = '', sau = '') => { if (r[k]) kho.push(truoc + r[k] + sau); };
    g(me, 'can', 'cân nặng mẹ ', ' kg'); g(me, 'ha', 'huyết áp ', ' mmHg');
    g(me, 'bctc', 'bề cao tử cung ', ' cm');
    g(thai, 'tt', 'tim thai ', ' l/p');
    if (r.efw) thai.push(`ước lượng cân nặng ${r.efw} g` + (r.bpv ? ` (bách phân vị ${r.bpv})` : ''));
    else if (r.bpv) thai.push(`ước lượng cân nặng ở bách phân vị ${r.bpv}`);
    if (r.ac) thai.push(`chu vi bụng ${r.ac} mm` + (r.acbpv ? ` (bách phân vị ${r.acbpv})` : ''));
    g(thai, 'afi', 'AFI ', ' cm'); g(thai, 'sdp', 'xoang ối lớn nhất ', ' cm');
    g(thai, 'nhau', 'nhau '); g(thai, 'cl', 'chiều dài kênh cổ tử cung ', ' mm');
    g(dop, 'uapi', 'UA PI '); g(dop, 'mcapi', 'MCA PI ');
    const cpr = cprCua(r);
    if (cpr !== null) dop.push(`CPR ${cpr.toFixed(2)}` + (r.cprbpv ? ` (bách phân vị ${r.cprbpv})` : ''));
    g(dop, 'utapi', 'UtA PI ');
    if (r.ctt && r.ctt !== 'còn sóng cuối tâm trương') dop.push(r.ctt);
    g(cuoi, 'xn'); g(cuoi, 'nhandinh', '→ ');
    const than = [me.join(', '), thai.join(', '), dop.length ? 'Doppler: ' + dop.join(', ') : '',
        cuoi.join(' ')].filter(Boolean);
    const dauCau = [d ? dmy(d) : '', ga !== null ? `thai ${tuanNgay(ga)}` : '', r.noi]
        .filter(Boolean).join(' — ');
    if (!dauCau && !than.length) return '';
    return (dauCau || 'không rõ ngày') + ': ' + (than.length ? than.join('; ') : 'chưa ghi chi tiết');
}

/** Gom các lần khám về ba ô tam cá nguyệt (mốc 14 và 28 tuần) */
function gomTheoTamCaNguyet() {
    const gom = ['', '', ''];
    docSo().forEach(r => {
        const ga = tuoiThaiLuc(gio(r.ngay));
        const tuan = ga === null ? null : Math.floor(ga / 7);
        const i = tuan === null ? 0 : tuan < 14 ? 0 : tuan < 28 ? 1 : 2;
        const cau = cauLanKham(r);
        if (cau) gom[i] = gom[i] ? gom[i] + ' | ' + cau : cau;
    });
    return gom;
}

/** Câu độ mờ da gáy — NT luôn phải đi kèm CRL lúc đo mới có nghĩa */
function ntCau() {
    const nt = chu('ob-ts-nt'), crl = chu('ob-ts-ntcrl');
    if (!nt) return '';
    return `độ mờ da gáy ${nt} mm` + (crl ? ` lúc CRL ${crl} mm` : ' (chưa ghi CRL lúc đo)');
}

/** Câu nghiệm pháp dung nạp glucose cho ô tam cá nguyệt II */
function cauOgtt() {
    const v = NGUONG_OGTT.map(([id, , ten]) => { const x = so(id); return x === null ? '' : `${ten} ${x}`; })
        .filter(Boolean);
    if (!v.length) return '';
    const tuan = chu('ob-ts-ogtt-tuan');
    const duong = NGUONG_OGTT.some(([id, nguong]) => { const x = so(id); return x !== null && x >= nguong; });
    return `nghiệm pháp dung nạp glucose 75 g${tuan ? ' lúc ' + tuan : ''} (${v.join(', ')} mmol/L) — `
        + (duong ? 'chẩn đoán đái tháo đường thai kỳ' : 'âm tính');
}

/* Lịch khám thai tối thiểu của bộ môn: mốc (tuần) — việc phải làm ở mốc đó */
const LICH_KHAM = [
    [8, 'khám thai lần đầu — định tuổi thai, siêu âm xác định thai trong tử cung'],
    [12, 'sàng lọc lệch bội quý I và đo độ mờ da gáy (11 – 13 tuần 6 ngày)'],
    [16, 'đo chiều dài kênh cổ tử cung tầm soát sinh non (16 – 18 tuần)'],
    [22, 'siêu âm hình thái học quý II (20 – 24 tuần)'],
    [28, 'nghiệm pháp dung nạp glucose 75 g (24 – 28 tuần)'],
    [32, 'siêu âm sinh trắc quý III — đánh giá tăng trưởng thai'],
    [36, 'cấy GBS âm đạo – hậu môn, đánh giá ngôi thai và khung chậu'],
    [38, 'khám mỗi tuần — theo dõi sức khỏe thai, bàn kế hoạch sinh']
];

function tinhLichKhamThai() {
    const t = chotTuoiThai();
    if (!t.chon) {
        ra('ob-kt-lich', 'Chốt ngày dự sinh ở khối định tuổi thai để máy đối chiếu lịch khám thai');
        return;
    }
    // Ngày làm bệnh án bỏ trống thì mốc so sánh là hôm nay, gặp bệnh án cũ sẽ
    // ra những con số như "thai 87 tuần" — chặn ở đây thay vì in ra cho hoảng.
    if (t.days < 0 || t.days > 320) {
        ra('ob-kt-lich', `Tuổi thai tính ra ${tuanNgay(t.days)} — vô lý. Kiểm tra lại ngày làm bệnh án ở mục hành chính và ngày dự sinh.`);
        return;
    }
    const tuan = Math.floor(t.days / 7);
    const noiDung = String($('ob-sokham')?.value || '') + ' ' + chu('ob-hx-tcn1') + ' '
        + chu('ob-hx-tcn2') + ' ' + chu('ob-hx-tcn3');
    const daTuan = [...noiDung.matchAll(/thai\s+(\d+)\s+tu[ầa]n/gi)].map(m => +m[1]);
    // Một mốc coi như đã khám nếu sổ có lần khám nào rơi trong khoảng ±3 tuần
    const thieu = LICH_KHAM.filter(([moc]) => tuan >= moc && !daTuan.some(x => Math.abs(x - moc) <= 3))
        .map(([moc, viec]) => `${moc} tuần (${viec})`);
    ra('ob-kt-lich', thieu.length
        ? `Thai ${tuan} tuần · sổ khám thai chưa có mốc: ${thieu.join('; ')}`
        : `Thai ${tuan} tuần · sổ khám thai đã có đủ các mốc bắt buộc tới thời điểm này`);
}

/* ---- Nghiệm pháp dung nạp glucose 75 g -------------------------------- */
const NGUONG_OGTT = [['ob-ts-ogtt0', 5.1, 'đói'], ['ob-ts-ogtt1', 10.0, '1 giờ'], ['ob-ts-ogtt2', 8.5, '2 giờ']];

function tinhOgtt() {
    const co = NGUONG_OGTT.map(([id, nguong, ten]) => ({ v: so(id), nguong, ten })).filter(x => x.v !== null);
    if (!co.length) {
        ra('ob-ogtt-out', 'Nhập ba giá trị để máy đối chiếu ngưỡng 5,1 – 10,0 – 8,5 mmol/L và kết luận đái tháo đường thai kỳ');
        return;
    }
    const vuot = co.filter(x => x.v >= x.nguong);
    const y = [`Đã nhập ${co.length}/3 giá trị`];
    if (vuot.length) y.push(`vượt ngưỡng ở ${vuot.map(x => `${x.ten} (${x.v} ≥ ${x.nguong})`).join(', ')} — đủ chẩn đoán đái tháo đường thai kỳ`);
    else if (co.length === 3) y.push('cả ba giá trị dưới ngưỡng — nghiệm pháp âm tính');
    else y.push('các giá trị đã có đều dưới ngưỡng, còn thiếu giá trị để kết luận');
    const doi = so('ob-ts-ogtt0');
    if (doi !== null && doi >= 7) y.push('đường huyết đói ≥ 7,0 mmol/L — nghĩ tới đái tháo đường có từ trước chứ không phải đái tháo đường thai kỳ');
    const tuan = chu('ob-ts-ogtt-tuan');
    const n = tuan.match(/(\d+)/);
    if (n && (+n[1] < 24 || +n[1] > 28)) y.push(`làm lúc ${tuan} — lệch mốc chuẩn 24 – 28 tuần, phải nói được vì sao làm sớm hoặc trễ`);
    ra('ob-ogtt-out', y.join(' · '));
}

/* ---- Tầm soát ba tam cá nguyệt: mốc nào sai thời điểm, mốc nào bỏ trống -- */
function tinhTamSoat() {
    const t = chotTuoiThai();
    const tuan = t.chon ? Math.floor(t.days / 7) : null;
    const y = [], nhac = [];

    const nt = so('ob-ts-nt'), ntcrl = so('ob-ts-ntcrl');
    if (nt !== null && ntcrl === null) nhac.push('có độ mờ da gáy mà thiếu CRL lúc đo — NT không kèm CRL thì không đọc được');
    if (ntcrl !== null && (ntcrl < 45 || ntcrl > 84)) nhac.push(`CRL ${ntcrl} mm ngoài khoảng 45 – 84 mm nên đo độ mờ da gáy lúc đó chưa đạt chuẩn`);
    if (nt !== null && nt >= 3) y.push(`độ mờ da gáy ${nt} mm dày — cần tư vấn chẩn đoán trước sinh dù sàng lọc nguy cơ thấp`);

    const hh = chu('ob-ts-huyethoc');
    if (hh && !/mcv|mch/i.test(hh)) nhac.push('phần huyết học mới ghi Hb — bộ môn đòi có MCV và MCH để loại thiếu máu hồng cầu nhỏ nhược sắc');

    const asp = chu('ob-ts-aspirin');
    if (asp.includes('sau 16 tuần')) y.push('aspirin bắt đầu sau 16 tuần — hiệu quả dự phòng tiền sản giật giảm nhiều');
    if (asp.includes('không dùng')) nhac.push('có chỉ định aspirin mà không dùng — phải nêu lý do trong bệnh sử');

    const cl = so('ob-ts-cl'), clh = chu('ob-ts-clhinh');
    if (cl !== null && cl < 25) y.push(`chiều dài kênh cổ tử cung ${cl} mm dưới 25 mm — nguy cơ sinh non, bàn progesterone đặt âm đạo hoặc vòng nâng`);
    if (clh && !clh.includes('chữ T')) y.push(`lỗ trong cổ tử cung ${clh} — kênh cổ tử cung đã biến đổi`);

    if (tuan !== null) {
        if (tuan >= 30 && !chu('ob-ts-ht2')) nhac.push('chưa ghi siêu âm hình thái học quý II (mốc 20 – 24 tuần)');
        if (tuan >= 30 && !NGUONG_OGTT.some(([id]) => so(id) !== null)) nhac.push('chưa ghi nghiệm pháp dung nạp glucose (mốc 24 – 28 tuần)');
        if (tuan >= 37 && chu('ob-ts-gbs') === 'chưa làm') nhac.push('thai đã ≥ 37 tuần mà chưa cấy GBS');
        if (tuan < 34 && tuan >= 24 && !chu('ob-ts-cort')) nhac.push('thai trong khoảng 24 – 34 tuần — nếu có nguy cơ sinh non phải nói tới corticosteroid trưởng thành phổi');
    }
    const ket = [...y, ...nhac.map(x => '⚠ ' + x)];
    ra('ob-ts-out', ket.length ? ket.join(' · ')
        : 'Máy soi các mốc tầm soát bắt buộc, nhắc mốc làm sai thời điểm hoặc còn bỏ trống');
}

/* =====================================================================
   BIỆN LUẬN SẢN KHOA — sáu bước bắt buộc
   ---------------------------------------------------------------------
   Không chấm điểm hộ, chỉ ghép đúng trình tự và chỉ ra bước nào đang trống
   kèm câu thầy sẽ hỏi ở chỗ đó. Câu hỏi lấy thẳng từ các buổi trình bệnh án
   giao ban, nên đọc xong là biết mình hổng ở đâu.
   ===================================================================== */
const BL_BUOC = [
    ['ob-bl-lmp', 'độ tin cậy của kinh chót', 'Kinh chót này có tin được không — nhớ rõ ngày chưa, chu kỳ có đều không, kỳ cuối có giống mọi kỳ không?'],
    ['ob-bl-nguon', 'nguồn chốt tuổi thai', 'Em chốt tuổi thai theo nguồn nào, vì sao không hiệu chỉnh theo siêu âm — hoặc vì sao phải hiệu chỉnh?'],
    ['ob-bl-cd', 'kết luận chuyển dạ', 'Sản phụ đã vào chuyển dạ chưa, dựa vào cơn gò nào, cổ tử cung thế nào?'],
    ['ob-bl-vande', 'vấn đề chính', 'Vấn đề chính của ca này là gì, và em đặt nó ở vị trí nào trong chẩn đoán?'],
    ['ob-bl-vi', 'căn cứ của vấn đề chính', 'Em nghĩ chẩn đoán đó vì những dữ kiện nào — đọc đúng con số trong bệnh án ra.'],
    ['ob-bl-loaitru', 'nhánh đã loại trừ', 'Còn những chẩn đoán nào cùng bệnh cảnh, em loại trừ chúng bằng gì?'],
    ['ob-bl-skthai', 'lượng giá sức khỏe thai', 'Trước khi quyết định, em đã lượng giá sức khỏe thai bằng gì — tim thai, cử động thai, CTG, siêu âm hay Doppler?'],
    ['ob-bl-xutri', 'quyết định xử trí', 'Ca này dưỡng thai tiếp hay chấm dứt thai kỳ, vì sao?'],
    ['ob-bl-thoidiem', 'thời điểm chấm dứt thai kỳ', 'Chấm dứt thai kỳ ở tuổi thai nào là hợp lý, có cần corticosteroid trưởng thành phổi không?'],
    ['ob-bl-duong', 'đường chấm dứt thai kỳ', 'Chấm dứt thai kỳ bằng đường nào — khởi phát chuyển dạ hay mổ lấy thai, và bằng phương tiện gì?'],
    ['ob-bl-duong-vi', 'lý do chọn đường đó', 'Vì sao chọn phương tiện đó — Bishop bao nhiêu, có vết mổ cũ không, có ối vỡ không?']
];

const BL_DUPHONG = [['obbl-cort', 'corticosteroid trưởng thành phổi'], ['obbl-mgbaove', 'MgSO4 bảo vệ thần kinh thai'],
['obbl-mgcogiat', 'MgSO4 phòng sản giật duy trì tới 24 giờ sau sinh'], ['obbl-haap', 'hạ áp khi huyết áp ≥ 160/110 mmHg'],
['obbl-ksoi', 'kháng sinh dự phòng khi ối vỡ non'], ['obbl-ksgbs', 'kháng sinh dự phòng GBS trong chuyển dạ'],
['obbl-antid', 'anti-D cho mẹ Rh âm'], ['obbl-bhss', 'dự phòng băng huyết sau sinh'],
['obbl-sosinh', 'báo nhi sơ sinh chuẩn bị hồi sức'],
['obbl-theodoisau', 'hẹn theo dõi sau sinh']];

/** Đoạn biện luận sáu bước, mỗi bước một dòng để dán thẳng vào mục X */
function cauBienLuanSan() {
    const d = [];
    const lmp = chu('ob-bl-lmp'), nguon = chu('ob-bl-nguon');
    if (lmp || nguon) {
        d.push('Tuổi thai: ' + [lmp, nguon ? 'chốt tuổi thai theo ' + nguon : ''].filter(Boolean).join('; ') + '.');
    }
    const cd = chu('ob-bl-cd'), cdThem = chu('ob-bl-cd-them');
    if (cd) d.push('Chuyển dạ: ' + cd + (cdThem ? '; còn phải theo dõi thêm ' + cdThem : '') + '.');
    const vd = chu('ob-bl-vande'), vi = chu('ob-bl-vi'), lt = chu('ob-bl-loaitru'), bc = chu('ob-bl-bienchung');
    if (vd || vi) {
        d.push('Nghĩ ' + (vd || 'vấn đề chính') + (vi ? ' vì ' + vi : '')
            + (lt ? '. Đã loại trừ ' + lt : '') + (bc ? '. Biến chứng đang theo dõi gồm ' + bc : '') + '.');
    }
    const sk = chu('ob-bl-skthai'), skVi = chu('ob-bl-skthai-vi');
    if (sk) d.push('Sức khỏe thai: ' + sk + (skVi ? ' — căn cứ ' + skVi : '') + '.');
    const xt = chu('ob-bl-xutri'), td = chu('ob-bl-thoidiem');
    if (xt || td) d.push('Hướng xử trí: ' + [xt, td].filter(Boolean).join(', vì ') + '.');
    const du = chu('ob-bl-duong'), duVi = chu('ob-bl-duong-vi');
    if (du) d.push('Đường chấm dứt thai kỳ: ' + du + (duVi ? ' — ' + duVi : '') + '.');
    const dp = daTich(BL_DUPHONG);
    if (dp.length) d.push('Dự phòng kèm theo: ' + dp.join(', ') + '.');
    return d.join('\n');
}

function tinhBienLuanSan() {
    const cau = cauBienLuanSan();
    ra('ob-bl-out', cau ? cau.split('\n')[0] + (cau.includes('\n') ? ` · và ${cau.split('\n').length - 1} đoạn nữa` : '')
        : 'Chọn các bước để máy ghép thành đoạn biện luận đúng trình tự bộ môn');

    const thieu = BL_BUOC.filter(([id]) => !chu(id));
    if (!thieu.length) {
        ra('ob-bl-thieu', `Đủ cả ${BL_BUOC.length} bước — đọc lại một lượt xem các con số có khớp phần khám và cận lâm sàng không`);
        return;
    }
    // Gom hết vào MỘT dòng, mỗi ý một dòng thì lấp kín màn hình mà không ai đọc
    ra('ob-bl-thieu', `Còn trống ${thieu.length}/${BL_BUOC.length} bước — ${thieu[0][2]}`
        + (thieu.length > 1 ? ` (còn thiếu cả: ${thieu.slice(1).map(x => x[1]).join(', ')})` : ''));
}

/* ---- Xét nghiệm tiền sản: tới tuổi thai này còn thiếu gì -------------- */
const XN_CO_BAN = [['obxn-nhommau', 'nhóm máu – Rhesus'], ['obxn-hbsag', 'HBsAg'], ['obxn-hiv', 'HIV'],
['obxn-giangmai', 'giang mai'], ['obxn-ctm', 'công thức máu'], ['obxn-nuoctieu', 'tổng phân tích nước tiểu']];
const XN_THEO_TUAN = [[14, 'obxn-ht1', 'siêu âm hình thái học quý I'], [14, 'obxn-sanloc', 'sàng lọc quý I'],
[24, 'obxn-ht2', 'siêu âm hình thái học quý II'], [28, 'obxn-ogtt', 'dung nạp glucose 75 g'],
[32, 'obxn-st3', 'siêu âm sinh trắc quý III'], [36, 'obxn-gbs', 'cấy GBS']];

function xnDaLam() {
    return [...document.querySelectorAll('[id^="obxn-"]')].filter(el => el.checked)
        .map(el => el.parentElement.querySelector('span')?.textContent.trim()).filter(Boolean);
}

function tinhXetNghiem() {
    const t = chotTuoiThai();
    const tuan = t.chon ? Math.floor(t.days / 7) : null;
    const thieu = XN_CO_BAN.filter(([id]) => !$(id)?.checked).map(([, ten]) => ten);
    if (tuan !== null) XN_THEO_TUAN.forEach(([moc, id, ten]) => {
        if (tuan >= moc && !$(id)?.checked) thieu.push(`${ten} (lẽ ra làm từ ${moc} tuần)`);
    });
    const da = xnDaLam().length;
    ra('ob-xn-out', !da && !thieu.length
        ? 'Tích các mục đã làm — máy nhắc những xét nghiệm còn thiếu theo tuổi thai'
        : `Đã làm ${da} mục` + (thieu.length ? ` · còn thiếu: ${thieu.join(', ')}` : ' · đủ các mục cần có tới tuổi thai này'));
}

/* ---- Khung chậu ba eo ------------------------------------------------ */
/* So KHỚP CHÍNH XÁC cả chuỗi, đừng dùng includes: "không sờ đụng mỏm nhô"
   chứa nguyên cụm "sờ đụng mỏm nhô" nên khám bình thường lại bị kết là hẹp. */
const KC_HEP = [
    ['ob-kc-momnho', 'sờ đụng mỏm nhô', 'eo trên'],
    ['ob-kc-govodanh', 'sờ quá 2/3 gờ vô danh', 'eo trên'],
    ['ob-kc-govodanh', 'sờ trọn gờ vô danh', 'eo trên'],
    ['ob-kc-gaihong', 'gai hông nhọn, nhô vào lòng chậu', 'eo giữa'],
    ['ob-kc-vachchau', 'hai vách chậu hội tụ', 'eo giữa'],
    ['ob-kc-xuongcung', 'xương cùng phẳng', 'eo giữa'],
    ['ob-kc-xuongcung', 'xương cùng gập góc', 'eo giữa'],
    ['ob-kc-vomve', 'góc vòm vệ nhọn, dưới 90°', 'eo dưới']
];

function cauKhungChau() {
    const p = [];
    const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
    g('ob-kc-momnho'); g('ob-kc-govodanh'); g('ob-kc-gaihong'); g('ob-kc-vachchau');
    g('ob-kc-xuongcung'); g('ob-kc-vomve');
    const un = so('ob-kc-ungoi');
    if (un !== null) p.push(`khoảng cách hai ụ ngồi ${un} cm`);
    return p.length ? 'Khung chậu: ' + p.join(', ') + '.' : '';
}

function tinhKhungChau() {
    const bat = KC_HEP.filter(([id, chuoi]) => chu(id) === chuoi).map(([, , eo]) => eo);
    const un = so('ob-kc-ungoi');
    if (un !== null && un < 8) bat.push('eo dưới');
    const daChon = KC_HEP.some(([id]) => chu(id)) || un !== null;
    const eo = [...new Set(bat)];
    ra('ob-kc-out', !daChon ? 'Chọn các mốc của ba eo để máy kết luận khung chậu bình thường hay nghi hẹp'
        : !eo.length ? 'Ba eo không có dấu hiệu bất thường — khung chậu bình thường trên lâm sàng'
            : `Có dấu hiệu hẹp ở ${eo.join(', ')} (${bat.length} dấu) — nghi khung chậu giới hạn, cân nhắc khi tiên lượng sinh ngả âm đạo`);
}

/* ---- Chẩn đoán + tiên lượng ba chữ P --------------------------------- */
function conSoRa() {
    const v = chu('ob-conso');
    if (v) return v;
    const sinh = (so('para-1') || 0) + (so('para-2') || 0);
    return sinh > 0 ? 'con rạ' : 'con so';
}

function cauChanDoanSan() {
    const p = [conSoRa()];
    const tt = cauTuoiThai(true);
    if (tt) p.push(tt);
    const soThai = chu('ob-sothai');
    if (soThai && !soThai.startsWith('một')) p.push(soThai);
    const ngoi = chu('ob-position') || chu('ob-leo3');
    if (ngoi) p.push('ngôi ' + ngoi.replace(/^ngôi\s+/i, ''));
    const the = chu('ob-the');
    if (the) p.push('kiểu thế ' + the);
    const gd = chu('ob-cd-gd');
    if (gd) p.push(gd);
    const vo = gio($('ob-oi-gio')?.value);
    if (vo) p.push(`ối vỡ giờ thứ ${Math.max(0, Math.round(cachGio(vo, mocBenhAn())))}`);
    return p.length > 1 ? p.join(', ') : '';
}

function tinhChanDoanSan() {
    const cau = cauChanDoanSan();
    ra('ob-dx-out', cau ? cau.charAt(0).toUpperCase() + cau.slice(1)
        : 'Máy dựng câu: con so / con rạ, thai … tuần, ngôi …, chuyển dạ giai đoạn …');

    const power = chu('ob-3p-power'), passage = chu('ob-3p-passage'), passenger = chu('ob-3p-passenger');
    if (!power && !passage && !passenger)
        return ra('ob-3p-out', 'Chọn đủ ba chữ P để máy nhận xét khả năng sinh ngả âm đạo');
    const chan = [];
    if (/hẹp rõ/.test(passage)) chan.push('khung chậu hẹp rõ');
    if (/bất xứng|ngôi bất thường/.test(passenger)) chan.push(passenger);
    const dedat = [];
    if (/nghi hẹp/.test(passage)) dedat.push('khung chậu nghi hẹp');
    if (/vết mổ/.test(passage)) dedat.push('vết mổ lấy thai cũ — theo dõi dọa nứt sẹo');
    if (/thưa yếu/.test(power)) dedat.push('cơn gò chưa hiệu quả, cần tăng co và đánh giá lại sau 2 giờ');
    if (/cường tính/.test(power)) dedat.push('cơn gò cường tính, phải giảm co ngay');
    if (/đa thai/.test(passenger)) dedat.push('đa thai — cách sinh tùy ngôi thai thứ nhất');
    const y = [chan.length
        ? `Không tiên lượng sinh ngả âm đạo được vì ${chan.join(' và ')} — hướng mổ lấy thai`
        : dedat.length ? 'Có thể theo dõi sinh ngả âm đạo nhưng phải dè dặt'
            : 'Ba chữ P thuận lợi — tiên lượng sinh ngả âm đạo được'];
    if (dedat.length) y.push(dedat.join(', '));
    const thai = chu('ob-ts-thai'), huong = chu('ob-ts-huong');
    if (thai) y.push('tiên lượng cho thai: ' + thai);
    if (huong) y.push('hướng xử trí: ' + huong);
    ra('ob-3p-out', y.join(' · '));
}

function leoCau() {
    const p = [];
    const t1 = chu('ob-leo1'), t2 = chu('ob-leo2'), t3 = chu('ob-leo3'), t4 = chu('ob-leo4');
    if (t1) p.push('đáy tử cung sờ được ' + t1);
    if (t2) p.push(t2);
    if (t3) p.push('đoạn dưới là ' + t3);
    if (t4) p.push('độ lọt ' + t4);
    const the = chu('ob-the');
    return 'Leopold: ' + p.join(', ') + (the ? `. Thế ${the}` : '') + '.';
}

/* ---- Nhi ------------------------------------------------------------- */
function tuoiThang() {
    const t = so('ped-months');
    if (t !== null) return t;
    const n = so('patient-age');
    return n !== null ? n * 12 : null;
}

function tinhNhi() {
    const th = tuoiThang(), can = so('vital-weight'), cao = so('vital-height');
    const y = [];
    if (th !== null) {
        const nam = th / 12;
        const canChuan = th < 12 ? th / 2 + 4 : nam <= 9 ? nam * 2 + 8 : nam * 3 + 3;
        const caoChuan = th < 12 ? 50 + th * 2 : nam * 5 + 75;
        y.push(`Ước lượng theo tuổi: cân chuẩn ≈ ${canChuan.toFixed(1)} kg, cao chuẩn ≈ ${caoChuan.toFixed(0)} cm`);
        if (can !== null) {
            const pct = can / canChuan * 100;
            const do_ = pct >= 90 ? 'trong giới hạn bình thường'
                : pct >= 75 ? 'suy dinh dưỡng độ I'
                    : pct >= 60 ? 'suy dinh dưỡng độ II' : 'suy dinh dưỡng độ III';
            y.push(`cân nặng đạt ${pct.toFixed(0)}% so với chuẩn — ${do_}`);
        }
        if (cao !== null) {
            const p2 = cao / caoChuan * 100;
            if (p2 < 90) y.push(`chiều cao chỉ đạt ${p2.toFixed(0)}% — thấp còi, suy dinh dưỡng mạn`);
        }
    }
    const muac = so('ped-muac');
    if (muac !== null && th !== null && th >= 6 && th <= 59) {
        y.push(muac < 11.5 ? `MUAC ${muac} cm — suy dinh dưỡng cấp nặng`
            : muac < 12.5 ? `MUAC ${muac} cm — suy dinh dưỡng cấp vừa` : `MUAC ${muac} cm — bình thường`);
    }
    ra('ped-grow-out', y.length ? y.join(' · ')
        : 'Nhập tuổi (tháng) cùng cân nặng — chiều cao ở phần sinh hiệu để máy chấm mức tăng trưởng');

    // Mất nước
    const nang = [
        chu('ped-mn-trigiac').includes('li bì'),
        chu('ped-mn-mat').includes('rất trũng'),
        chu('ped-mn-uong').includes('uống kém'),
        chu('ped-mn-veoda').includes('rất chậm')
    ].filter(Boolean).length;
    const vua = [
        chu('ped-mn-trigiac').includes('kích thích'),
        chu('ped-mn-mat') === 'trũng',
        chu('ped-mn-uong').includes('háo hức'),
        chu('ped-mn-veoda').includes('chậm dưới')
    ].filter(Boolean).length;
    const daChon = ['ped-mn-trigiac', 'ped-mn-mat', 'ped-mn-uong', 'ped-mn-veoda'].filter(i => chu(i)).length;
    ra('ped-mn-out', !daChon ? 'Chọn bốn dấu trên để máy xếp loại mất nước'
        : nang >= 2 ? 'MẤT NƯỚC NẶNG — bù dịch đường tĩnh mạch theo phác đồ C'
            : (vua + nang) >= 2 ? 'Có mất nước — bù dịch bằng ORS theo phác đồ B'
                : 'Không mất nước — phác đồ A, cho uống thêm dịch tại nhà');

    // Sinh
    const tt = so('ped-tuoithai'), cs = so('ped-cansinh'), sy = [];
    if (tt !== null) sy.push(tt < 37 ? `Sinh non ${tt} tuần` : tt >= 42 ? `Sinh già tháng ${tt} tuần` : `Đủ tháng ${tt} tuần`);
    if (cs !== null) sy.push(cs < 2500 ? `nhẹ cân lúc sinh ${cs} g` : cs > 4000 ? `thai to ${cs} g` : `cân nặng lúc sinh ${cs} g bình thường`);
    ra('ped-sinh-out', sy.length ? sy.join(' · ') : 'Nhập tuổi thai và cân nặng lúc sinh để máy xếp non tháng — nhẹ cân');

    // Chủng ngừa: mũi nào tới tuổi mà chưa tích
    const thieu = [...document.querySelectorAll('[id^="vx-"][data-thang]')]
        .filter(el => th !== null && +el.dataset.thang <= th && !el.checked)
        .map(el => el.parentElement.textContent.trim());
    ra('ped-vx-out', th === null ? 'Nhập tuổi (tháng) ở khối nhi khoa để máy đối chiếu bé còn thiếu mũi nào'
        : thieu.length ? `Tới ${th} tháng tuổi còn thiếu ${thieu.length} mũi: ${thieu.slice(0, 4).join('; ')}${thieu.length > 4 ? '…' : ''}`
            : 'Đã tiêm đủ các mũi theo lịch tính tới tuổi hiện tại');

    // Phát triển
    const cham = [...document.querySelectorAll('[id^="pt-"][data-thang]')]
        .filter(el => th !== null && +el.dataset.thang <= th && !el.checked)
        .map(el => el.parentElement.querySelector('span')?.childNodes[0]?.textContent.trim());
    ra('ped-pt-out', th === null ? 'Máy so mốc đã đạt với tuổi hiện tại để nhận xét chậm phát triển hay không'
        : cham.length ? `Chưa đạt ${cham.length} mốc lẽ ra phải có ở ${th} tháng: ${cham.filter(Boolean).join(', ')}`
            : 'Đạt đủ các mốc phát triển tương ứng tuổi');
}

/* ---- Nội ------------------------------------------------------------- */
function tinhNoi() {
    const tt = chu('noi-tuanthu'), nv = so('noi-nhapvien'), y = [];
    if (tt.includes('tự ngưng') || tt.includes('không đều'))
        y.push('Tuân thủ kém — hỏi kỹ đợt bệnh này có phải khởi phát sau khi bỏ thuốc');
    else if (tt.includes('đều mỗi ngày')) y.push('Tuân thủ tốt — nếu vẫn không kiểm soát thì xem lại phác đồ, liều, bệnh kèm');
    if (nv !== null && nv >= 2) y.push(`${nv} lần nhập viện trong 12 tháng — bệnh chưa được kiểm soát ngoại trú`);
    if (chu('noi-bienchung')) y.push('Đã có biến chứng cơ quan đích — nhớ đưa vào chẩn đoán và phần biện luận');
    ra('noi-out', y.length ? y.join(' · ')
        : 'Chọn mức tuân thủ để máy nhận xét — đợt bệnh này có phải do bỏ thuốc hay không');
}

/* ---- Cấp cứu --------------------------------------------------------- */
const CUA_SO = {
    'đột quỵ thiếu máu não': [4.5, 'cửa sổ tiêu sợi huyết 4,5 giờ; lấy huyết khối có thể tới 6 – 24 giờ nếu hình ảnh phù hợp'],
    'nhồi máu cơ tim ST chênh lên': [2, 'can thiệp mạch vành trong 120 phút kể từ lúc tiếp xúc y tế đầu tiên'],
    'chấn thương nặng — giờ vàng': [1, 'giờ vàng của chấn thương — 60 phút đầu quyết định'],
    'sốc nhiễm khuẩn — giờ đầu': [1, 'kháng sinh và bù dịch ngay trong giờ đầu'],
    'ngộ độc cấp': [1, 'rửa dạ dày và than hoạt chỉ còn ý nghĩa trong 1 – 2 giờ đầu']
};

function tinhCC() {
    const kp = gio($('cc-onset')?.value);
    const den = gio($('cc-time')?.value) || mocBenhAn();
    if (!kp) return ra('cc-clock-out', 'Nhập giờ khởi phát và thời điểm tiếp nhận để máy tính đã trôi qua bao lâu');
    const h = cachGio(kp, den);
    const canh = chu('cc-canh');
    const cs = CUA_SO[canh];
    let t = `Từ lúc khởi phát tới lúc tiếp nhận: ${ngayGio(h)}`;
    if (cs) t += ` · ${cs[1]} — ${h <= cs[0] ? 'CÒN TRONG CỬA SỔ' : 'đã quá cửa sổ, chuyển hướng điều trị'}`;
    ra('cc-clock-out', t);
}

let raf = 0;
function tinh() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        tinhNgoai(); tinhSan(); tinhNhi(); tinhNoi(); tinhCC();
    });
}

/* =====================================================================
   5. NÚT "GHI VÀO Ô…" — đưa dữ liệu có cấu trúc thành câu văn bệnh án
   --------------------------------------------------------------------- */
function ghiVao(id, dauDong, cau) {
    const el = $(id);
    if (!el) return;
    const giu = el.value.split('\n').filter(l => l.trim() && !dauDong.test(l.trim()));
    el.value = [cau, ...giu].join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* Ghi một câu vào ô chữ của bệnh án, rồi báo cho mạch tự lưu biết */
function datO(id, cau) {
    const el = $(id);
    if (!el || !cau) return;
    el.value = cau;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#sxk-apply')) {
        const p = [];
        const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
        g('sxk-nhin'); g('sxk-diem', 'đau khu trú '); g('sxk-phanung'); g('sxk-dekhang');
        g('sxk-phucmac', 'cảm ứng phúc mạc '); g('sxk-nghiem'); g('sxk-khoiu', 'sờ được khối ');
        g('sxk-go'); g('sxk-nhudong'); g('sxk-tructrang', 'thăm trực tràng: ');
        g('sxk-thoatvi', 'thoát vị: '); g('sxk-vetmo', 'vết mổ: '); g('sxk-danluu');
        if (!p.length) return;
        ghiVao('exam-abdomen', /^Khám bụng ngoại khoa:/i, 'Khám bụng ngoại khoa: ' + p.join(', ') + '.');
    }
    if (e.target.closest('#ob-leo-apply')) {
        if (!chu('ob-leo3')) return;
        ghiVao('exam-abdomen', /^Leopold:/i, leoCau());
    }
    if (e.target.closest('#ob-ga-apply')) {
        const t = chotTuoiThai();
        if (!t.chon) return;
        const them = [
            $('ob-lmp2')?.value && `kinh áp chót ${$('ob-lmp2').value.split('-').reverse().join('/')}`,
            chu('ob-lmp-songay') && `ra huyết ${chu('ob-lmp-songay')}`,
            chu('ob-lmp-luong'), chu('ob-lmp-mau'),
            chu('ob-lmp-kemtheo') && `kèm ${chu('ob-lmp-kemtheo')}`,
            chu('ob-lmp-tc') && `kỳ kinh chót ${chu('ob-lmp-tc')}`,
            chu('ob-tiemchung-truoc') && `tiêm chủng trước mang thai: ${chu('ob-tiemchung-truoc')}`
        ].filter(Boolean);
        ghiVao('history-obgyne', /^Định tuổi thai:/i,
            `Định tuổi thai: ${cauTuoiThai()}${them.length ? ' (' + them.join(', ') + ')' : ''}.`);
    }
    if (e.target.closest('#ob-tc-apply')) {
        const p = [];
        const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
        g('ob-tc-kethon', 'lập gia đình năm '); g('ob-tc-mongcon'); g('ob-tc-thuthai');
        g('ob-tc-solan'); g('ob-tc-kehoach', 'thai lần này '); g('ob-tc-phukhoa', 'bệnh phụ khoa: ');
        g('ob-tc-mophukhoa'); g('ob-tc-mobung');
        if (!p.length) return;
        ghiVao('history-obgyne', /^Tiền căn sản khoa:/i, 'Tiền căn sản khoa: ' + p.join(', ') + '.');
    }
    if (e.target.closest('#ob-xn-apply')) {
        const da = xnDaLam();
        datO('ob-hx-tests', da.length ? 'đã làm ' + da.join(', ') : 'chưa làm xét nghiệm tiền sản nào');
    }
    if (e.target.closest('#ob-vag-apply')) {
        const p = [];
        const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
        g('ob-movit', 'đặt mỏ vịt: '); g('ob-nitrazine', 'Nitrazine test '); g('ob-dauoi');
        g('ob-chongxuong'); g('ob-buou');
        if (p.length) ghiVao('exam-abdomen', /^Khám âm đạo:/i, 'Khám âm đạo: ' + p.join(', ') + '.');
        const kc = cauKhungChau();
        if (kc) datO('ob-pelvis', kc.replace(/^Khung chậu:\s*/, '').replace(/\.$/, ''));
    }
    if (e.target.closest('#ob-bung-apply')) {
        const cau = cauKhamBung();
        if (cau) ghiVao('exam-abdomen', /^Khám bụng sản khoa:/i, cau);
    }
    if (e.target.closest('#ob-gd-apply')) {
        const co = daTich(GD_KIEM);
        const cau = co.length ? 'Gia đình ghi nhận ' + co.join(', ') : 'Gia đình chưa ghi nhận bệnh lý nào trong bảng kiểm';
        ghiVao('history-family', /^Gia đình (ghi nhận|chưa ghi nhận)/i,
            cau + ($('obgd-dahoi')?.checked ? '; các bệnh còn lại trong bảng kiểm đều không ghi nhận' : '') + '.');
    }
    if (e.target.closest('#ob-nk-apply')) {
        const co = daTich(NK_KIEM);
        const cau = co.length ? 'Ghi nhận bệnh lý ' + co.join(', ') : 'Chưa ghi nhận bệnh lý nội khoa nào trong bảng kiểm';
        ghiVao('history-internal', /^(Ghi nhận bệnh lý|Chưa ghi nhận bệnh lý nội khoa)/i,
            cau + ($('obnk-dahoi')?.checked ? '; các nhóm còn lại trong bảng kiểm đều không ghi nhận' : '') + '.');
    }
    if (e.target.closest('#ob-lan-add')) {
        const cau = cauLanMangThai();
        const el = $('history-obgyne');
        if (!cau || !el) return;
        const cu = el.value.split('\n').map(x => x.trim());
        if (!cu.includes(cau)) {
            el.value = (el.value.trimEnd() + '\n' + cau).trim();
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    if (e.target.closest('#ob-lan-clear')) {
        O_MOT_LAN.forEach(id => { const el = $(id); if (el) el.value = ''; });
        tinh();
    }
    if (e.target.closest('#ob-sk-add')) {
        const ds = docSo();
        // Hàng mới để trống ngày: ghiSo() xếp nó xuống cuối cho tới khi có ngày
        ds.push(Object.fromEntries(SK_F.map(([k]) => [k, ''])));
        skMo.clear();
        ghiSo(ds);
        tinh();
        // Con trỏ vào thẳng ô ngày của hàng vừa thêm, khỏi phải rê chuột
        $('ob-sk-wrap')?.querySelector('tbody tr:last-of-type .sk-in')?.focus();
    }
    const more = e.target.closest('.sk-more');
    if (more) {
        const i = +more.dataset.i;
        if (skMo.has(i)) skMo.delete(i); else skMo.add(i);
        skDaVe = null;                     // buộc vẽ lại dù nội dung sổ không đổi
        veBangSoKham();
    }
    const xoa = e.target.closest('.sk-del');
    if (xoa) {
        const ds = docSo();
        ds.splice(+xoa.dataset.i, 1);
        skMo.clear();
        ghiSo(ds);
        tinh();
    }
    if (e.target.closest('#ob-kt-apply')) {
        const gom = gomTheoTamCaNguyet();
        let co = false;
        [['ob-hx-tcn1', gom[0]], ['ob-hx-tcn2', gom[1]], ['ob-hx-tcn3', gom[2]]]
            .forEach(([id, v]) => { if (v) { datO(id, v); co = true; } });
        if (!co) showToast('Sổ khám thai chưa có lần khám nào để tóm tắt');
    }
    if (e.target.closest('#ob-ts-apply-hx')) {
        const t1 = [chu('ob-ts-ht1'), ntCau(), chu('ob-ts-lechboi') && `${chu('ob-ts-lechboi')}: ${chu('ob-ts-lechboi-kq') || 'chưa có kết quả'}`,
        chu('ob-ts-nhommau') && 'nhóm máu ' + chu('ob-ts-nhommau'), chu('ob-ts-huyethoc'),
        chu('ob-ts-nhiemtrung'), chu('ob-ts-tsg') && 'sàng lọc tiền sản giật ' + chu('ob-ts-tsg'),
        chu('ob-ts-aspirin') && 'aspirin ' + chu('ob-ts-aspirin')].filter(Boolean).join('; ');
        const t2 = [chu('ob-ts-ht2') && 'siêu âm hình thái học quý II ' + chu('ob-ts-ht2'),
        chu('ob-ts-cl') && `chiều dài kênh cổ tử cung ${chu('ob-ts-cl')} mm`
        + (chu('ob-ts-clhinh') ? ', ' + chu('ob-ts-clhinh') : ''),
        cauOgtt(), chu('ob-ts-dtd-dt') && 'điều trị ' + chu('ob-ts-dtd-dt')].filter(Boolean).join('; ');
        const t3 = [chu('ob-ts-gbs') && 'cấy GBS ' + chu('ob-ts-gbs'), chu('ob-ts-vat'),
        chu('ob-ts-cort'), chu('ob-ts-skthai')].filter(Boolean).join('; ');
        let co = false;
        [['ob-hx-tcn1', t1], ['ob-hx-tcn2', t2], ['ob-hx-tcn3', t3]]
            .forEach(([id, v]) => { if (v) { datO(id, v); co = true; } });
        if (!co) showToast('Chưa nhập mục tầm soát nào để ghi xuống');
    }
    if (e.target.closest('#ob-bl-apply')) {
        const cau = cauBienLuanSan();
        if (!cau) { showToast('Chọn ít nhất một bước biện luận trước đã'); return; }
        const el = $('diagnosis-reasoning');
        if (!el) return;
        el.value = [cau, el.value.trim()].filter(Boolean).join('\n');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        showToast('Đã ghi đoạn biện luận sản khoa vào mục Biện luận');
    }
    if (e.target.closest('#ob-bl-xutri-apply')) {
        const p = [];
        const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
        g('ob-bl-xutri'); g('ob-bl-thoidiem', 'thời điểm: '); g('ob-bl-duong');
        g('ob-bl-duong-vi', 'vì ');
        const dp = daTich(BL_DUPHONG);
        if (dp.length) p.push('dự phòng: ' + dp.join(', '));
        if (!p.length) { showToast('Chưa chọn hướng xử trí nào'); return; }
        datO('treatment-plan', p.join('. ') + '.');
    }
    if (e.target.closest('#ob-kh-apply')) {
        const p = [];
        const g = (id, truoc = '') => { const v = chu(id); if (v) p.push(truoc + v); };
        g('ob-kh-tranhthai-tg', 'tránh thai: '); g('ob-kh-phathai');
        g('ob-kh-tuoithai', 'tuổi thai lúc bỏ '); g('ob-kh-pp'); g('ob-kh-lydo', 'lý do ');
        g('ob-kh-noi', 'thực hiện tại '); g('ob-kh-bienchung');
        if (!p.length) return;
        ghiVao('history-obgyne', /^Kế hoạch gia đình:/i, 'Kế hoạch gia đình: ' + p.join(', ') + '.');
    }
    if (e.target.closest('#ob-tt-apply')) {
        const cau = cauTomTat();
        if (cau) datO('summary', cau);
    }
    if (e.target.closest('#ob-dx-apply')) {
        const cau = cauChanDoanSan();
        if (cau) datO('dx1-main', cau.charAt(0).toUpperCase() + cau.slice(1));
    }
    if (e.target.closest('#ob-ts-apply')) {
        const t = $('ob-3p-out')?.textContent || '';
        if (!t || t.startsWith('Chọn đủ')) return;
        const dt = [chu('ob-dt-ks'), chu('ob-dt-go'), chu('ob-dt-cort'), chu('ob-ts-dieutri')]
            .filter(v => v && !/^không|^chưa dùng/.test(v));
        const dan = chu('ob-ts-danho');
        datO('prognosis', t + (dt.length ? ' · điều trị: ' + dt.join(', ') : '')
            + (dan ? ' · dặn dò sản phụ: ' + dan : '') + '.');
    }
    if (e.target.closest('#ped-sinh-apply')) {
        const p = [];
        const g = (id, truoc = '', sau = '') => { const v = chu(id); if (v) p.push(truoc + v + sau); };
        g('ped-tuoithai', 'sinh lúc ', ' tuần'); g('ped-cachsinh'); g('ped-cansinh', 'cân nặng lúc sinh ', ' g');
        g('ped-khoc'); g('ped-vangda'); g('ped-duongnhi');
        g('ped-para', 'mẹ PARA '); g('ped-tuoime', 'mẹ ', ' tuổi lúc sinh'); g('ped-benhme');
        datO('ped-birth', p.join(', '));
    }
    if (e.target.closest('#ped-dd-apply')) {
        const p = [];
        const g = (id, truoc = '', sau = '') => { const v = chu(id); if (v) p.push(truoc + v + sau); };
        g('ped-feed-now'); g('ped-anduam', 'bắt đầu ăn dặm lúc ', ' tháng'); g('ped-khaupan');
        datO('ped-nutrition', p.join(', '));
    }
    if (e.target.closest('#ped-vx-apply')) {
        const da = [...document.querySelectorAll('[id^="vx-"][data-thang]')]
            .filter(el => el.checked).map(el => el.parentElement.textContent.trim());
        const nguon = chu('ped-vx-nguon');
        datO('ped-vaccine', [nguon, da.length ? 'đã tiêm ' + da.join(', ') : 'chưa tiêm mũi nào']
            .filter(Boolean).join(', '));
    }
    if (e.target.closest('#ped-pt-apply')) {
        const da = [...document.querySelectorAll('[id^="pt-"][data-thang]')].filter(el => el.checked)
            .map(el => el.parentElement.querySelector('span')?.childNodes[0]?.textContent.trim()).filter(Boolean);
        datO('ped-development', da.length ? 'đã đạt ' + da.join(', ')
            : 'chưa đạt mốc phát triển nào được ghi nhận');
    }
});

/* =====================================================================
   6. KHỞI ĐỘNG
   ===================================================================== */
/* Gõ thẳng trong bảng sổ khám thai: ô của bảng không phải ô của bệnh án, nên
   phải gom lại rồi ghi ngược vào #ob-sokham — chỗ duy nhất được lưu.
   Bắt ở pha capture và chặn lan để tinh() không vẽ lại bảng giữa lúc đang gõ
   (vẽ lại là mất con trỏ); ghiSo() sẽ tự phát input trên ô lưu. */
function nhapTrongBang(e) {
    const o = e.target.closest?.('.sk-in');
    if (!o) return false;
    const ds = docSo();
    const r = ds[+o.dataset.i];
    if (!r) return false;
    r[o.dataset.k] = o.value.trim();
    e.stopPropagation();
    skDangGo = true;
    // Giữ nguyên thứ tự đang hiện trong lúc gõ: ghiSo() xếp theo ngày, mà xếp
    // lại giữa chừng thì hàng nhảy đi chỗ khác ngay dưới tay người dùng.
    const el = $('ob-sokham');
    if (el) {
        el.value = ds.map(dongSo).join('\n');
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
}
document.addEventListener('input', (e) => { nhapTrongBang(e); tinh(); }, true);
document.addEventListener('change', (e) => {
    // Rời ô rồi mới xếp lại theo ngày và vẽ lại
    if (e.target.closest?.('.sk-in')) { skDangGo = false; skDaVe = null; ghiSo(docSo()); }
    tinh();
}, true);
/* Bỏ ô mà không đổi gì thì 'change' không bắn — vẫn phải hạ cờ, kẻo bảng đứng
   im cho tới lần gõ sau. */
document.addEventListener('focusout', (e) => {
    if (!e.target.closest?.('.sk-in')) return;
    skDangGo = false;
    skDaVe = null;
    tinh();
}, true);
$('type-chips')?.addEventListener('click', () => { apHoSo(); tinh(); });

function batDau(moi) {
    apHoSo();
    tinh();
    if (!moi) return;                       // bệnh án cũ: loại đã lưu sẵn, không hỏi lại
    const tm = khoaCuaThuMuc();
    if (tm && tm.k) {                        // thư mục đã xác định khoa -> tự chuyển, im lặng
        if (tm.k !== loaiHienTai()) chon(tm.k); else apHoSo();
        bangThuMuc(tm.f, tm.k);
        return;
    }
    moCong(false);                           // còn lại: bắt chọn trước khi gõ
}

/* loadExisting() của tao-benh-an.js có thể chạy xong TRƯỚC khi file này được
   nạp (bệnh án đã có sẵn trong máy thì nó không phải chờ await nào cả), nên
   ngoài việc nghe sự kiện còn phải đọc dấu để lại trên thẻ <html>. */
if (document.documentElement.dataset.baMoi) batDau(document.documentElement.dataset.baMoi === '1');
else document.addEventListener('ba:mo', (e) => batDau(!!e.detail?.moi), { once: true });
