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
            'legend:tiencan': 'IV. TIỀN CĂN — PARA, tiền thai, phụ khoa',
            'legend:kham': 'VI. KHÁM LÂM SÀNG — toàn thân và khám sản',
            'label:exam-abdomen': '6. Bụng — tử cung, ngôi thai'
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

/* Tìm <legend> theo chữ đầu dòng, tìm một lần rồi nhớ luôn */
const legendCache = {};
function timNhan(khoa) {
    if (khoa.startsWith('label:')) return document.querySelector(`label[for="${khoa.slice(6)}"]`);
    if (legendCache[khoa]) return legendCache[khoa];
    const dau = khoa === 'legend:tiencan' ? 'IV. TIỀN CĂN' : 'VI. KHÁM LÂM SÀNG';
    const el = [...document.querySelectorAll('legend')]
        .find(l => l.textContent.trim().startsWith(dau));
    if (el) legendCache[khoa] = el;
    return el;
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
function apHoSo() {
    const t = loaiHienTai();
    const hs = HO_SO[t] || HO_SO.noi;

    document.body.dataset.khoa = t;
    document.documentElement.style.setProperty('--khoa-mau', hs.mau);

    // Nhãn và gợi ý gõ: trả tất cả về gốc trước, rồi mới đắp của khoa hiện tại
    ['legend:tiencan', 'legend:kham', 'label:exam-abdomen'].forEach(k => datNhan(k, hs.nhan[k]));
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
    const tan = so('ob-go-tan');
    if (tan !== null) cd.push(`Cơn gò ${tan} cơn trong 10 phút` + (tan >= 5 ? ' — cơn gò cường tính' : ''));
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
document.addEventListener('input', tinh);
document.addEventListener('change', tinh);
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
