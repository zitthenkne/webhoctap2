// waiting-room.js — Trang chờ: danh sách bệnh án
import { showToast } from '../../core/utils.js';
import { guideOn, setGuide } from '../../core/guide.js';
import { onSessionUser } from '../../core/auth-session.js';
import {
    listLocal, sortRecords, syncFromCloud, syncNow, deleteRecord, saveRecord,
    isSignedIn, exportJson, importJson, watchCloud, syncInfo, isPinned as storePinned, setPinned
} from '../medical-record/record-store.js';
import {
    listFolders, saveFolder, deleteFolder, getFolder, newFolderId, mergeFolders, folderMeta, folderSpec
} from '../medical-record/folder-store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Tìm kiếm tiếng Việt không dấu =================
   Gõ "nguyen van ba" phải ra "Nguyễn Văn Ba", gõ nhiều từ thì phải khớp đủ các từ
   (không cần đúng thứ tự). Bỏ dấu theo TỪNG ký tự để độ dài chuỗi không đổi —
   nhờ vậy vị trí khớp trên chuỗi đã bỏ dấu cũng là vị trí trên chuỗi gốc, tô sáng mới đúng chỗ. */
const foldChar = (ch) => {
    const b = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (b === 'đ' ? 'd' : b === 'Đ' ? 'd' : (b || ch)).toLowerCase();
};
const fold = (str) => Array.from(String(str ?? '')).map(foldChar).join('');

/** Bọc <mark> vào những đoạn khớp từ khóa, đồng thời escape phần còn lại */
function hl(text) {
    const raw = String(text ?? '');
    if (!raw || !qTokens.length) return esc(raw);
    const f = fold(raw);
    if (f.length !== raw.length) return esc(raw);           // ký tự lạ làm lệch chỉ số thì thôi, khỏi tô
    const hits = [];
    for (const t of qTokens) {
        for (let i = f.indexOf(t); i >= 0; i = f.indexOf(t, i + t.length)) hits.push([i, i + t.length]);
    }
    if (!hits.length) return esc(raw);
    hits.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [a, b] of hits) {
        if (a < pos) continue;                              // đoạn chồng nhau thì bỏ qua
        out += esc(raw.slice(pos, a)) + '<mark class="hl">' + esc(raw.slice(a, b)) + '</mark>';
        pos = b;
    }
    return out + esc(raw.slice(pos));
}

/* ================= Sidebar (giữ nguyên hành vi cũ) ================= */
function setupChrome() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const closeSidebar = () => {
        sidebar?.classList.add('-translate-x-full');
        overlay?.classList.add('hidden');
    };
    document.getElementById('menu-toggle-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar?.classList.remove('-translate-x-full');
        overlay?.classList.remove('hidden');
    });
    document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    sidebar?.querySelector('nav')?.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) closeSidebar();
    });
    /* Máy tính bảng (768–1179px): tự thu thanh bên thành dải icon để vùng bệnh án rộng ra (2 cột thẻ thay vì 1).
       Người dùng đã tự bấm nút thu gọn/mở rộng (localStorage sidebarMini có giá trị) thì tôn trọng lựa chọn đó. */
    const autoMini = () => {
        let pref = null;
        try { pref = localStorage.getItem('sidebarMini'); } catch { }
        if (pref !== null) return;
        document.body.classList.toggle('sb-mini', window.innerWidth >= 768 && window.innerWidth < 1180);
    };
    const syncSidebarWidth = () => {
        if (window.innerWidth >= 768) sidebar?.classList.remove('-translate-x-full');
        else sidebar?.classList.add('-translate-x-full');
        overlay?.classList.add('hidden');
        autoMini();
    };
    window.addEventListener('resize', syncSidebarWidth);
    syncSidebarWidth();

}

/* ================= Tính % hoàn thiện + từng MỤC của bệnh án =================
   Đếm theo danh sách mục bắt buộc của một bệnh án học thuật, không đếm theo
   số trường có sẵn trong dữ liệu — bản ghi thưa mà vẫn 100% là vô nghĩa.
   Chia theo đúng 6 tab của trang viết bệnh án (id = data-tab) → thẻ vẽ được dải 6 mục
   "mục nào đủ / mục nào còn thiếu" và nút Viết tiếp nhảy thẳng vào mục còn thiếu đầu tiên. */
const SECTIONS = [
    { id: 'hanh-chinh', name: 'Hành chính', icon: 'user',
        paths: ['hanhChinh.hoTen', 'hanhChinh.gioiTinh', 'hanhChinh.ngheNghiep', 'hanhChinh.diaChi', 'hanhChinh.ngayVaoVien', 'hanhChinh.ngayLamBenhAn', 'hanhChinh.benhVien'] },
    { id: 'lydo-tiensu', name: 'Bệnh sử & Tiền căn', icon: 'notes-medical',
        paths: ['lyDoVaoVien', 'benhSu', 'tienSu.noiKhoa', 'tienSu.ngoaiKhoa', 'tienSu.diUng', 'tienSu.thoiQuen', 'tienSu.giaDinh'] },
    { id: 'kham-benh', name: 'Khám', icon: 'stethoscope',
        paths: ['khamBenh.sinhTon.mach', 'khamBenh.sinhTon.huyetAp', 'khamBenh.sinhTon.nhietDo', 'khamBenh.sinhTon.nhipTho',
            'khamBenh.tongTrang', 'khamBenh.tim', 'khamBenh.phoi', 'khamBenh.bung', 'khamBenh.thanKinhCoXuongKhop'] },
    { id: 'chan-doan-dieu-tri', name: 'Biện luận', icon: 'diagnoses',
        paths: ['tomTatBenhAn', 'datVanDe', 'chanDoanSoBo', 'chanDoanPhanBiet', 'bienLuanChanDoan'] },
    { id: 'can-lam-sang', name: 'Kết quả CLS', icon: 'vials', paths: ['canLamSangDeNghi'] },
    { id: 'ket-luan', name: 'Chẩn đoán & Điều trị', icon: 'clipboard-check', paths: ['chanDoanXacDinh', 'huongDieuTri', 'tienLuong'] }
];
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/** Mỗi mục: đã điền bao nhiêu / tổng, và mức none · part · full (≥70% coi là đủ để khỏi bắt bẻ từng ô nhỏ) */
function sectionsOf(rec) {
    return SECTIONS.map((sec) => {
        let filled = sec.paths.filter(p => String(getPath(rec, p) ?? '').trim()).length;
        let total = sec.paths.length;
        if (sec.id === 'hanh-chinh') { total++; if (String(rec.hanhChinh?.tuoi ?? rec.hanhChinh?.namSinh ?? '').trim()) filled++; }
        if (sec.id === 'kham-benh') { total++; if (Object.values(rec.luocQuaCoQuan || {}).some(v => String(v ?? '').trim())) filled++; }
        if (sec.id === 'can-lam-sang') { total++; if ((rec.canLamSang || []).length) filled++; }
        const f = total ? filled / total : 0;
        return { id: sec.id, name: sec.name, icon: sec.icon, filled, total, level: f >= 0.7 ? 'full' : f > 0 ? 'part' : 'none' };
    });
}
function completeness(rec) {
    const ss = sectionsOf(rec);
    const filled = ss.reduce((a, x) => a + x.filled, 0), total = ss.reduce((a, x) => a + x.total, 0);
    return Math.min(100, Math.round(filled / total * 100));
}
/** Mục còn thiếu đầu tiên (theo thứ tự tab) — null khi mọi mục đã đủ */
const nextStepOf = (rec) => sectionsOf(rec).find(x => x.level !== 'full') || null;

/* ================= Thời gian tương đối ================= */
function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!t) return '';
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' giờ trước';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' ngày trước';
    return new Date(t).toLocaleDateString('vi-VN');
}

/* ================= Trạng thái trang ================= */
let records = [];
let filter = 'all';
let keyword = '';
let sortMode = 'new';
let folderId = '';   // '' = tất cả đợt thực hành
let viewMode = 'grid';   // 'grid' = thẻ đầy đủ, 'compact' = danh sách gọn
let groupBy = 'folder';  // folder · status · kind · none
let qTokens = [];        // từ khóa đã bỏ dấu, tách theo khoảng trắng
let selectMode = false;
const selected = new Set();   // id các bệnh án đang chọn

const isDone = (r) => (r.status || 'Hoàn thành') === 'Hoàn thành';
// Kéo thả thẻ vào đợt chỉ dành cho chuột; trên cảm ứng, draggable làm trình duyệt cướp cử chỉ nhấn giữ
const CAN_DRAG = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Nhớ bộ lọc / thư mục / kiểu sắp xếp. Trên điện thoại người dùng ra vào bệnh án
   liên tục, mỗi lần quay lại phải chọn lại đợt thực hành thì rất mệt. */
const PREF_KEY = 'waitingRoomPrefs_v1';
function loadPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
        if (['all', 'done', 'draft'].includes(p.filter)) filter = p.filter;
        if (['new', 'old', 'name', 'pct', 'admit', 'bed'].includes(p.sortMode)) sortMode = p.sortMode;
        if (['grid', 'compact'].includes(p.viewMode)) viewMode = p.viewMode;
        if (['folder', 'status', 'kind', 'none'].includes(p.groupBy)) groupBy = p.groupBy;
        if (typeof p.folderId === 'string') folderId = p.folderId;
    } catch { }
}
function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ filter, sortMode, folderId, viewMode, groupBy })); } catch { }
}

/* Ghim bệnh án đang theo dõi: nằm ở nhóm "Ghim" trên cùng. Lưu trong record-store → ĐI THEO TÀI KHOẢN
   (ghim ở điện thoại, mở máy tính cũng thấy), mỗi lần bật/tắt có dấu thời gian để hai máy không giẫm nhau. */
const isPinned = (r) => storePinned(r.id);
function togglePin(id) {
    const on = setPinned(id, !storePinned(id));
    render();
    return on;
}

/** Bệnh án lọt qua đợt đang xem + từ khóa, chưa xét trạng thái — dùng để đếm cho nút lọc trạng thái */
function baseRecords() {
    return records.filter(r => {
        if (folderId === '__none__') { if (r.thuMuc?.id) return false; }
        else if (folderId && String(r.thuMuc?.id || '') !== String(folderId)) return false;
        if (!qTokens.length) return true;
        const hay = fold([
            r.hanhChinh?.hoTen, r.hanhChinh?.soPhong, r.hanhChinh?.roomNumber,
            r.hanhChinh?.soGiuong, r.hanhChinh?.bedNumber, r.hanhChinh?.benhVien,
            r.hanhChinh?.ngheNghiep, r.thuMuc?.ten, r.lyDoVaoVien, r.benhSu,
            r.chanDoanSoBo, r.chanDoanXacDinh, r.tomTatBenhAn
        ].join(' '));
        return qTokens.every(t => hay.includes(t));
    });
}

function visibleRecords() {
    let out = baseRecords().filter(r => filter === 'all' || (filter === 'done' ? isDone(r) : !isDone(r)));
    const admitOf = (r) => String(r.hanhChinh?.ngayVaoVien || '');
    const bedOf = (r) => `${r.hanhChinh?.soPhong || r.hanhChinh?.roomNumber || ''}`.padStart(6, '0') + `${r.hanhChinh?.soGiuong || r.hanhChinh?.bedNumber || ''}`.padStart(4, '0');
    if (sortMode === 'name') {
        out.sort((a, b) => (a.hanhChinh?.hoTen || '').localeCompare(b.hanhChinh?.hoTen || '', 'vi'));
    } else if (sortMode === 'pct') {
        // Gần xong nhất lên đầu; đã xong thì xuống cuối (không còn việc để làm)
        out = sortRecords(out).sort((a, b) => (isDone(a) - isDone(b)) || (completeness(b) - completeness(a)));
    } else if (sortMode === 'admit') {
        out.sort((a, b) => admitOf(b).localeCompare(admitOf(a)));
    } else if (sortMode === 'bed') {
        out.sort((a, b) => bedOf(a).localeCompare(bedOf(b), 'vi', { numeric: true }));
    } else {
        out = sortRecords(out);
        if (sortMode === 'old') out.reverse();
    }
    return out;
}

/* Nút lọc trạng thái trên thanh công cụ kèm số đếm theo phạm vi đang xem (đợt + từ khóa)
   → con số khớp với danh sách bên dưới. */
function renderStats() {
    const base = baseRecords();
    const done = base.filter(isDone).length;
    document.getElementById('stat-total').textContent = base.length;
    document.getElementById('stat-done').textContent = done;
    document.getElementById('stat-draft').textContent = base.length - done;
    document.querySelectorAll('#stat-filter [data-filter]').forEach(b => {
        const on = b.dataset.filter === filter;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

function emptyState() {
    const inFolder = folderId && folderId !== '__none__';
    if (!baseRecords().length && !qTokens.length) {
        return inFolder ? `
            <div class="wr-empty">
                <span class="ic"><i class="fas fa-folder-open"></i></span>
                <b>Đợt này chưa có bệnh án</b>
                <p>Bệnh án tạo ở đây tự điền sẵn khoa, bệnh viện và chuyên khoa của đợt.</p>
                <button id="empty-create" class="wr-primary"><i class="fas fa-plus"></i> Tạo bệnh án trong đợt</button>
            </div>` : `
            <div class="wr-empty">
                <img class="wr-empty-img" src="../quiz/web_assets/mascot_stationery_squirrel.webp" alt="" width="132" height="132">
                <b>Chưa có bệnh án nào</b>
                <p>Bấm <b>Tạo bệnh án</b> để viết bệnh án đầu tiên. Bài viết tự lưu ngay khi bạn gõ.</p>
                <button id="empty-create" class="wr-primary"><i class="fas fa-plus"></i> Tạo bệnh án</button>
            </div>`;
    }
    return `
        <div class="wr-empty">
            <span class="ic"><i class="fas fa-magnifying-glass"></i></span>
            <b>Không có bệnh án nào khớp</b>
            <p>Thử bớt từ khóa, hoặc bỏ bộ lọc trạng thái đang bật.</p>
            <button id="empty-clear" class="wr-ghost"><i class="fas fa-rotate-left"></i> Bỏ lọc</button>
        </div>`;
}

// [tên, màu chính (băng keo, thanh tiến độ), nền nhạt, mực chữ] — tông pastel.
// Tránh vàng bơ và bạc hà: hai màu đó dành cho trạng thái Đang viết / Hoàn thành.
const KINDS = {
    noi: ['Nội khoa', '#f4a9c6', '#fdeef4', '#a9466f'],     // hồng phấn
    ngoai: ['Ngoại khoa', '#8ecdf2', '#eaf6fd', '#2f6f9a'], // xanh trời
    san: ['Sản khoa', '#f6ae94', '#fff1ea', '#a3553a'],     // hồng đào
    nhi: ['Nhi khoa', '#c3b1f0', '#f5f1fe', '#6a52a8'],     // oải hương
    cc: ['Cấp cứu', '#f59a9a', '#fff0f0', '#a83c3c']        // san hô
};

/** Dải 6 mục (khớp 6 tab trang viết bệnh án): ô đầy = mục đủ, nửa = đang dở, rỗng = chưa viết; rê chuột/giữ để xem x/y */
function progHtml(ss, pct) {
    const pips = ss.map(x => `<i class="${x.level}" title="${esc(x.name)}: ${x.filled}/${x.total}"></i>`).join('');
    return `<span class="rc-prog" title="Mức độ hoàn thiện ${pct}%"><span class="rc-pips">${pips}</span>${pct}%</span>`;
}

function cardHtml(rec) {
    const id = esc(rec.id);
    const h = rec.hanhChinh || {};
    const [kindName, kindColor, kindSoft, kindInk] = KINDS[rec.loaiBenhAn] || KINDS.noi;
    // Thẻ đi một họ màu theo chuyên khoa; giới tính chỉ tô icon ♀/♂ (nữ hồng, nam xanh, chưa ghi tím)
    const gt = String(h.gioiTinh || '').trim();
    const isNu = /nữ/i.test(gt), isNam = /nam/i.test(gt);
    const sexColor = isNu ? '#f472b6' : isNam ? '#60a5fa' : '#a78bfa';
    const sexIcon = isNu ? 'venus' : isNam ? 'mars' : 'genderless';
    const hoTen = h.hoTen || 'Chưa đặt tên';
    const initial = esc((h.hoTen || '?').trim().charAt(0).toUpperCase() || '?');

    const tuoi = esc(h.tuoi) || (h.namSinh ? String(new Date().getFullYear() - parseInt(h.namSinh)) : '');
    const phong = esc(h.soPhong || h.roomNumber);
    const giuong = esc(h.soGiuong || h.bedNumber);
    const admitMeta = (() => {
        const m = String(h.ngayVaoVien || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `vào ${m[3]}/${m[2]}` : '';
    })();
    // Ở bệnh viện sinh viên gọi bệnh nhân theo PHÒNG · GIƯỜNG chứ không theo tên → làm thành "thẻ đầu giường" nổi bật
    const bed = [phong && 'P.' + phong, giuong && 'G.' + giuong].filter(Boolean).join(' · ');
    const meta = [esc(gt), tuoi && tuoi + ' tuổi', admitMeta].filter(Boolean).join(' · ');

    const lyDo = rec.lyDoVaoVien || '';
    const chanDoan = rec.chanDoanXacDinh || rec.chanDoanSoBo || '';
    const track = (rec.theoDoi || []).length;
    const done = isDone(rec);
    const pinned = isPinned(rec);
    // Đợt thực hành đã hiện ở tiêu đề nhóm / đầu trang → thẻ chỉ ghi bệnh viện cho bệnh án chưa xếp đợt
    const place = !rec.thuMuc?.id && h.benhVien
        ? `<span class="rc-place"><i class="fas fa-hospital"></i>${hl(h.benhVien)}</span>` : '';
    const ss = sectionsOf(rec);
    const pct = completeness(rec);
    // Việc tiếp theo = mục đầu tiên chưa đủ; bấm là mở thẳng tab đó (tao-benh-an.html?tab=…)
    const next = done ? null : (ss.find(x => x.level !== 'full') || null);

    return `
        <article draggable="${CAN_DRAG}" class="rec-card${selected.has(String(rec.id)) ? ' selected' : ''}${pinned ? ' pinned' : ''}" data-id="${id}" data-done="${done ? 1 : 0}"
            style="--kind:${kindColor};--kind-soft:${kindSoft};--kind-ink:${kindInk};--sex:${sexColor}">
            <span class="rc-check"><i class="fas fa-check"></i></span>
            ${pinned ? '<span class="rc-pin" title="Đã ghim"><i class="fas fa-thumbtack"></i></span>' : ''}
            <div class="rc-body card-open" title="${done ? 'Bấm để xem bệnh án' : 'Bấm để viết tiếp'}">
                <div class="rc-top">
                    <div class="rc-avatar">${initial}</div>
                    <div class="rc-id">
                        <p class="rc-name" title="${esc(hoTen)}">${hl(hoTen)}</p>
                        <p class="rc-meta">${bed ? `<span class="rc-bed" title="Phòng · giường"><i class="fas fa-bed"></i>${bed}</span>` : ''}<span class="rc-meta-t"${admitMeta ? ' title="vào = ngày vào viện"' : ''}><i class="fas fa-${sexIcon}"></i>${meta || '—'}</span></p>
                    </div>
                    <span class="rc-state ${done ? 'done' : 'draft'}"><i class="fas fa-${done ? 'check' : 'pen'}"></i>${done ? 'Hoàn thành' : 'Đang viết'}</span>
                </div>
                <div class="rc-lines">
                    <p class="rc-line cd ${chanDoan ? '' : 'empty'}" title="${esc(chanDoan)}"><span class="lbl">Chẩn đoán</span>${chanDoan ? hl(chanDoan) : 'Chưa có chẩn đoán'}</p>
                    <p class="rc-line ld ${lyDo ? '' : 'empty'}" title="${esc(lyDo)}"><span class="lbl">Lý do</span>${lyDo ? hl(lyDo) : 'Chưa ghi lý do vào viện'}</p>
                </div>
                ${next ? `<button type="button" class="rc-next next-step" data-id="${id}" data-tab="${next.id}" title="Mở thẳng mục ${esc(next.name)}">
                    <i class="fas fa-${next.icon}"></i><span>Tiếp theo: <b>${esc(next.name)}</b></span><i class="fas fa-arrow-right rc-next-go"></i></button>` : ''}
                <div class="rc-foot">
                    <span class="rc-kind"><span class="dot"></span>${esc(kindName)}</span>
                    ${place}
                    ${progHtml(ss, pct)}
                    <span class="rc-time">${timeAgo(rec.lastUpdated)}</span>
                </div>
            </div>

            <div class="rc-actions">
                <button class="rc-btn edit-record${done ? '' : ' primary'}" data-id="${id}" data-tab="${next ? next.id : ''}" ${next ? `title="Viết tiếp ở mục ${esc(next.name)}"` : ''}><i class="fas fa-pen"></i>${done ? 'Sửa' : 'Viết tiếp'}</button>
                <button class="rc-btn view-record${done ? ' primary' : ''}" data-id="${id}"><i class="fas fa-eye"></i>Xem</button>
                <button class="rc-btn track-record" data-id="${id}" title="Theo dõi diễn tiến hằng ngày"><i class="fas fa-clipboard-list"></i>Theo dõi${track ? ` (${track})` : ''}</button>
                <button class="rc-btn more menu-record" data-id="${id}" aria-label="Thêm lựa chọn"><i class="fas fa-ellipsis-v"></i></button>
            </div>
            <div class="rc-menu">
                <button class="pin-record" data-id="${id}"><i class="fas fa-thumbtack"></i>${pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>
                <button class="move-record" data-id="${id}"><i class="fas fa-folder-tree"></i>Chuyển sang đợt khác</button>
                <button class="dup-record" data-id="${id}"><i class="fas fa-copy"></i>Nhân bản</button>
                <button class="delete-record danger" data-id="${id}"><i class="fas fa-trash"></i>Xóa bệnh án</button>
            </div>
        </article>`;
}

/* ================= Bảng "Hôm nay" =================
   Mở trang lên là thấy ngay HAI việc đáng làm nhất, mỗi việc một chạm:
   (1) bệnh án viết dở gần nhất + MỤC CÒN THIẾU đầu tiên → nút Viết tiếp nhảy thẳng vào mục đó;
   (2) đợt thực hành đang đi: còn mấy ngày, đã xong mấy bệnh án (so với chỉ tiêu nếu có) + nút thêm bệnh án trong đợt. */
const daysLeft = (f) => {
    if (!f.denNgay) return null;
    return Math.round((new Date(f.denNgay + 'T00:00:00') - new Date(todayIso() + 'T00:00:00')) / 86400000);
};
function ringHtml(done, total) {
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    return `<span class="td-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${pct} 100"/></svg><b>${done}<small>/${total}</small></b></span>`;
}

function rotationTile() {
    const cur = folderId && folderId !== '__none__' ? getFolder(folderId) : null;
    const f = folderId ? (cur && isOngoing(cur) ? cur : null) : sortedFolders().find(isOngoing);
    if (!f) return '';
    const inF = records.filter(r => String(r.thuMuc?.id || '') === String(f.id));
    const done = inF.filter(isDone).length;
    const quota = Number(f.chiTieu) || 0;
    const target = quota || inF.length;
    const left = daysLeft(f);
    const leftTxt = left == null ? 'đang đi' : left > 0 ? `còn ${left} ngày` : left === 0 ? 'hôm nay là ngày cuối' : 'quá hạn ' + (-left) + ' ngày';
    const missing = quota ? Math.max(0, quota - done) : 0;
    const [, c, soft, ink] = folderKind(f);
    // thanh mảnh = thời gian đã đi của đợt (khác vòng tròn = số bệnh án) → so được "bệnh án có kịp thời gian không"
    let timePct = null;
    if (f.tuNgay && f.denNgay) {
        const a = new Date(f.tuNgay + 'T00:00:00').getTime(), b = new Date(f.denNgay + 'T00:00:00').getTime(), n = new Date(todayIso() + 'T00:00:00').getTime();
        if (b > a) timePct = Math.max(0, Math.min(100, Math.round((n - a) / (b - a) * 100)));
    }
    return `<div class="td-rot" style="--fc:${c};--fc-soft:${soft};--fc-ink:${ink}">
        ${ringHtml(done, target)}
        <div class="td-rot-txt">
            <span class="td-flag"><i class="fas fa-flag"></i> Đợt đang đi · ${leftTxt}</span>
            <b class="td-rot-name">${esc(f.ten || 'Đợt thực hành')}</b>
            <span class="td-rot-meta">${done}/${inF.length} bệnh án đã xong${quota ? ` · chỉ tiêu ${quota}${missing ? `, <b>còn thiếu ${missing}</b>` : ' <b>— đã đủ</b>'}` : ''}</span>
            ${timePct != null ? `<span class="td-time" title="Đã đi ${timePct}% thời gian của đợt"><i style="width:${timePct}%"></i></span>` : ''}
        </div>
        <button type="button" class="td-new" data-new-in="${esc(f.id)}"><i class="fas fa-plus"></i><span>Bệnh án trong đợt</span></button>
    </div>`;
}

function resumeTile() {
    const hide = selectMode || qTokens.length || filter === 'done';
    // Chỉ xét trong đợt đang xem: đang ở đợt Nhi thì đừng mời viết tiếp bệnh án bên Nội
    const draft = hide ? null : sortRecords(baseRecords().filter(r => !isDone(r)))[0];
    if (!draft) return '';
    const pct = completeness(draft);
    const next = nextStepOf(draft);
    const ten = draft.hanhChinh?.hoTen || 'Bệnh án chưa đặt tên';
    const noi = folderId ? '' : [draft.thuMuc?.ten, draft.hanhChinh?.benhVien].filter(Boolean)[0] || '';
    return `
        <button class="resume-card" data-resume="${esc(draft.id)}" data-tab="${next ? next.id : ''}">
            <span class="rz-ic"><i class="fas fa-pen-nib"></i></span>
            <span class="rz-txt">
                <span class="rz-flag">Viết dở gần nhất · ${pct}%</span>
                <b class="rz-name">${esc(ten)}</b>
                <span class="rz-meta">${esc(noi)}${noi ? ' · ' : ''}sửa ${timeAgo(draft.lastUpdated)}</span>
                ${next ? `<span class="rz-next"><i class="fas fa-${next.icon}"></i>Còn thiếu: <b>${esc(next.name)}</b></span>` : ''}
                <span class="rz-bar"><i style="width:${pct}%"></i></span>
            </span>
            <span class="rz-cta"><span>${next ? 'Viết tiếp mục này' : 'Viết tiếp'}</span> <i class="fas fa-arrow-right"></i></span>
        </button>`;
}

function renderResume() {
    const slot = document.getElementById('resume-slot');
    if (!slot) return;
    const a = resumeTile();
    const b = (selectMode || qTokens.length) ? '' : rotationTile();
    slot.innerHTML = a || b ? `<div class="wr-today${a && b ? ' two' : ''}">${a}${b}</div>` : '';
}

/* Đầu mỗi nhóm: dùng chung cho nhóm theo đợt / trạng thái / chuyên khoa / ghim */
function groupHeadHtml(o) {
    return `<div class="wg-head" ${o.c ? `style="--fc:${o.c};--fc-soft:${o.soft};--fc-ink:${o.ink}"` : ''}>
        <span class="wg-ico"><i class="fas fa-${o.icon}"></i></span>
        <div class="wg-txt">
            <p class="wg-name">${esc(o.name)}<small>${o.count} bệnh án</small></p>
            ${o.meta ? `<p class="wg-meta">${esc(o.meta)}</p>` : ''}
        </div>
        ${o.goto ? `<button type="button" class="wg-open" data-goto-folder="${esc(o.goto)}">Mở đợt <i class="fas fa-arrow-right text-[10px]"></i></button>` : ''}
    </div>`;
}
const gridHtml = (rs) => `<div class="wr-grid">${rs.map(cardHtml).join('')}</div>`;

/* Đang xem "Tất cả" mà có đợt thực hành → chia nhóm theo đợt (đợt đang đi / mới nhất lên đầu),
   bệnh án chưa xếp đợt để cuối. Trong mỗi nhóm giữ thứ tự sắp xếp đang chọn. */
function groupsHtml(list) {
    const folders = sortedFolders();
    const out = folders.map(f => {
        const rs = list.filter(r => String(r.thuMuc?.id || '') === String(f.id));
        if (!rs.length) return '';
        const [, c, soft, ink] = folderKind(f);
        const meta = [f.khoa, f.benhVien, dateRange(f)].filter(Boolean).join(' · ');
        return `<section class="wr-group">${groupHeadHtml({ icon: 'folder', name: f.ten || 'Đợt thực hành', count: rs.length, meta, c, soft, ink, goto: f.id })}${gridHtml(rs)}</section>`;
    }).join('');
    const loose = list.filter(r => !r.thuMuc?.id);
    return out + (loose.length ? `<section class="wr-group">${groupHeadHtml({
        icon: 'inbox', name: 'Chưa xếp vào đợt', count: loose.length,
        meta: 'Kéo thả thẻ vào một đợt ở cột trái, hoặc ⋮ → Chuyển sang đợt khác'
    })}${gridHtml(loose)}</section>` : '');
}

/* Nhóm theo trạng thái (Đang viết trước — việc còn phải làm) hoặc theo chuyên khoa */
function groupsByHtml(list, mode) {
    let defs;
    if (mode === 'status') {
        defs = [
            { k: 'draft', name: 'Đang viết', icon: 'pen', c: '#f0c95a', soft: '#fff5d8', ink: '#87590f', meta: 'Còn việc phải làm', test: r => !isDone(r) },
            { k: 'done', name: 'Hoàn thành', icon: 'circle-check', c: '#86d9ae', soft: '#e6f7ee', ink: '#2e7d57', meta: 'Đã viết xong', test: r => isDone(r) }
        ];
    } else {
        defs = Object.entries(KINDS).map(([k, [name, c, soft, ink]]) => ({ k, name, icon: 'stethoscope', c, soft, ink, test: r => (r.loaiBenhAn in KINDS ? r.loaiBenhAn : 'noi') === k }));
    }
    return defs.map(d => {
        const rs = list.filter(d.test);
        return rs.length ? `<section class="wr-group">${groupHeadHtml({ ...d, count: rs.length })}${gridHtml(rs)}</section>` : '';
    }).join('');
}

function render() {
    renderFolders();   // chạy trước: đợt đang chọn có thể đã bị xóa, phải trả về "Tất cả" ngay
    renderStats();
    const box = document.getElementById('medical-record-cards');
    const list = visibleRecords();
    for (const id of [...selected]) if (!records.some(r => String(r.id) === id)) selected.delete(id);
    // Ghim lên đầu (khi đang tìm kiếm thì để kết quả tự xếp, đừng tách nhóm)
    const pinned = qTokens.length ? [] : list.filter(isPinned);
    const rest = pinned.length ? list.filter(r => !isPinned(r)) : list;
    const pinHtml = pinned.length ? `<section class="wr-group wr-pinned">${groupHeadHtml({
        icon: 'thumbtack', name: 'Ghim', count: pinned.length, meta: 'Bệnh án đang theo dõi — luôn nằm trên cùng',
        c: '#f4a9c6', soft: '#fdeef4', ink: '#a9466f'
    })}${gridHtml(pinned)}</section>` : '';
    let main = '';
    if (rest.length) {
        if (groupBy === 'status' || groupBy === 'kind') main = groupsByHtml(rest, groupBy);
        else if (groupBy === 'folder' && !folderId && listFolders().length > 0) main = groupsHtml(rest);
        else main = gridHtml(rest);
    }
    box.innerHTML = !list.length ? emptyState() : pinHtml + main;
    box.classList.toggle('select-mode', selectMode);
    box.classList.toggle('view-compact', viewMode === 'compact');
    document.querySelectorAll('#view-toggle button').forEach(b =>
        b.classList.toggle('on', b.dataset.view === viewMode));
    const count = document.getElementById('result-count');
    if (count) count.textContent = list.length ? `${list.length} bệnh án` : '';
    renderResume();
    renderBulkBar();
    if (kbId) kbCard()?.classList.add('kb');
    document.getElementById('empty-create')?.addEventListener('click', createNew);
    document.getElementById('empty-clear')?.addEventListener('click', clearFilters);
}

/** Bỏ lọc trạng thái + từ khóa (giữ nguyên đợt đang xem — đợt là phạm vi, không phải bộ lọc) */
function clearFilters() {
    filter = 'all';
    keyword = '';
    qTokens = [];
    const box = document.getElementById('search-record');
    if (box) box.value = '';
    savePrefs();
    render();
}

/* ================= Thư mục đợt thực hành ================= */
function countIn(id) {
    return records.filter(r => String(r.thuMuc?.id || '') === String(id)).length;
}

// Ngày theo giờ máy (toISOString là giờ UTC — sáng sớm ở VN sẽ lùi một ngày)
function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Hôm nay nằm trong khoảng ngày của đợt → đợt đang đi */
const isOngoing = (f) => {
    const t = todayIso();
    return !!f.tuNgay && f.tuNgay <= t && (!f.denNgay || t <= f.denNgay);
};
/** "01/09 – 30/09" (ghi năm khi khác năm nay) */
function dateRange(f) {
    const y = String(new Date().getFullYear());
    const d = (v) => {
        const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}${m[1] !== y ? '/' + m[1] : ''}` : '';
    };
    return [d(f.tuNgay), d(f.denNgay)].filter(Boolean).join(' – ');
}
/** Màu của đợt theo chuyên khoa (chọn tay hoặc đoán từ tên khoa); không rõ thì kem sữa */
const folderKind = (f) => KINDS[folderSpec(f)] || ['', '#dcc3a8', '#faf4ee', '#86684b'];

/** Đợt đang đi lên đầu, rồi đợt bắt đầu muộn hơn trước; đợt chưa ghi ngày xuống cuối */
function sortedFolders() {
    return mergeFolders(records).slice().sort((a, b) =>
        (isOngoing(b) - isOngoing(a))
        || String(b.tuNgay || '').localeCompare(String(a.tuNgay || ''))
        || String(b.id).localeCompare(String(a.id)));
}

function renderFolders() {
    const box = document.getElementById('folder-list');
    if (!box) return;
    const folders = sortedFolders();
    if (folderId && folderId !== '__none__' && !folders.some(f => String(f.id) === String(folderId))) {
        folderId = '';        // đợt đã bị xóa ở máy khác — đừng để danh sách trống không lý do
        savePrefs();
    }
    const loose = records.filter(r => !r.thuMuc?.id).length;
    const row = (id, icon, name, n, o = {}) => `
        <div class="fp-row${String(folderId) === String(id) ? ' active' : ''}" role="button" tabindex="0" data-folder="${esc(id)}"
            ${o.c ? `style="--fc:${o.c};--fc-soft:${o.soft};--fc-ink:${o.ink}"` : ''}>
            <span class="fp-ico"><i class="fas fa-${icon}"></i></span>
            <span class="fp-txt">
                <span class="fp-name"><span class="fp-name-t">${esc(name)}</span>${o.now ? '<span class="fp-now">Đang đi</span>' : ''}</span>
                ${o.meta ? `<span class="fp-meta">${esc(o.meta)}</span>` : ''}
                ${o.sub ? `<span class="fp-meta">${esc(o.sub)}</span>` : ''}
                ${o.pct != null ? `<span class="fp-mini" title="${o.sub}"><i style="width:${o.pct}%"></i></span>` : ''}
            </span>
            <span class="fp-side">
                <span class="fp-count">${n}</span>
                ${o.edit ? `<button type="button" class="fp-edit" data-folder-edit="${esc(id)}" title="Sửa đợt" aria-label="Sửa đợt ${esc(name)}"><i class="fas fa-pen"></i></button>` : ''}
            </span>
        </div>`;

    let html = row('', 'layer-group', 'Tất cả bệnh án', records.length);
    if (folders.length) {
        html += folders.map(f => {
            const inF = records.filter(r => String(r.thuMuc?.id || '') === String(f.id));
            const done = inF.filter(isDone).length;
            const [, c, soft, ink] = folderKind(f);
            const quota = Number(f.chiTieu) || 0;
            const target = quota || inF.length;
            return row(f.id, 'folder', f.ten || 'Đợt thực hành', inF.length, {
                c, soft, ink, now: isOngoing(f), edit: true,
                meta: [f.khoa, f.benhVien].filter(Boolean).join(' · ') || 'Chưa ghi khoa / bệnh viện',
                sub: [dateRange(f), target ? `${done}/${target} ${quota ? 'chỉ tiêu' : 'đã xong'}` : ''].filter(Boolean).join(' · '),
                pct: target ? Math.min(100, Math.round(done / target * 100)) : null
            });
        }).join('');
        if (loose) html += row('__none__', 'inbox', 'Chưa xếp vào đợt', loose);
    } else {
        html += `<div class="fp-empty">Gom bệnh án theo từng đợt đi lâm sàng. Bệnh án tạo trong đợt tự điền sẵn khoa, bệnh viện và chuyên khoa.
            <button type="button" data-folder-new><i class="fas fa-plus mr-1"></i>Tạo đợt đầu tiên</button></div>`;
    }
    box.innerHTML = html;
    renderChips(folders, loose);
    renderScope();
}

/* Điện thoại / máy tính bảng: hàng chip đổi đợt một chạm (cột đợt ở đây là bảng trượt, phải bấm 2 lần).
   Cùng dữ liệu với cột đợt; bảng trượt vẫn giữ để xem chi tiết, sửa, thêm đợt. */
let chipsFor = null;
function renderChips(folders, loose) {
    const box = document.getElementById('folder-chips');
    if (!box) return;
    // Hình tab thư mục + icon (không phải viên tròn chấm màu) để khỏi lẫn với nút lọc trạng thái ngay bên dưới
    const chip = (id, name, n, o = {}) => `<button type="button" class="wc${String(folderId) === String(id) ? ' on' : ''}${o.now ? ' now' : ''}" data-chip="${esc(id)}"
        ${o.k ? `style="--fc:${o.k[1]};--fc-soft:${o.k[2]};--fc-ink:${o.k[3]}"` : ''}${o.now ? ' title="Đang đi"' : ''}>
        <i class="fas fa-${o.icon || 'folder'}"></i><span class="wc-t">${esc(name)}</span><b>${n}</b></button>`;
    box.innerHTML = chip('', 'Mọi đợt', records.length, { icon: 'layer-group' })
        + folders.map(f => chip(f.id, f.ten || 'Đợt thực hành', countIn(f.id), { k: folderKind(f), now: isOngoing(f) })).join('')
        + (loose && folders.length ? chip('__none__', 'Chưa xếp', loose, { icon: 'inbox' }) : '')
        + `<button type="button" class="wc wc-add" data-folder-new><i class="fas fa-plus"></i>Đợt mới</button>`;
    if (chipsFor !== folderId) {            // chỉ cuộn khi vừa đổi đợt, đừng giật hàng chip lúc đang gõ tìm
        chipsFor = folderId;
        const on = box.querySelector('.wc.on');
        if (on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
    }
}

/** Đầu vùng bệnh án: tên phạm vi đang xem + thông tin đợt + nút sửa / tạo */
function renderScope() {
    const cur = folderId && folderId !== '__none__' ? getFolder(folderId) : null;
    const $ = (id) => document.getElementById(id);
    const nDot = listFolders().length;
    const [title, icon, meta] = cur
        ? [cur.ten || 'Đợt thực hành', 'folder-open',
            [cur.khoa, cur.benhVien, dateRange(cur)].filter(Boolean).join(' · ') + (isOngoing(cur) ? ' · đang đi' : '') || 'Chưa ghi khoa / bệnh viện — bấm Sửa đợt để thêm']
        : folderId === '__none__'
            ? ['Chưa xếp vào đợt', 'inbox', 'Bệnh án không thuộc đợt thực hành nào']
            : ['Tất cả bệnh án', 'layer-group', `${records.length} bệnh án${nDot ? ` · ${nDot} đợt thực hành` : ''}`];
    $('scope-title').textContent = title;
    $('scope-meta').textContent = meta;
    const sw = $('folder-switch');
    if (cur) {
        const [, c, soft, ink] = folderKind(cur);
        sw.style.setProperty('--fc', c);
        sw.style.setProperty('--fc-soft', soft);
        sw.style.setProperty('--fc-ink', ink);
    } else {
        ['--fc', '--fc-soft', '--fc-ink'].forEach(k => sw.style.removeProperty(k));
    }
    $('scope-ico').innerHTML = `<i class="fas fa-${icon}"></i>`;
    $('scope-edit').classList.toggle('hidden', !cur);
    const lbl = document.querySelector('#create-new-record span');
    if (lbl) lbl.textContent = cur ? 'Tạo bệnh án trong đợt' : 'Tạo bệnh án';
}

/* Điện thoại: cột đợt là bảng trượt từ đáy */
function openFolderSheet() {
    document.getElementById('folder-pane')?.classList.add('open');
    document.body.classList.add('fp-open');
}
function closeFolderSheet() {
    document.getElementById('folder-pane')?.classList.remove('open');
    document.body.classList.remove('fp-open');
}
const sheetOpen = () => document.body.classList.contains('fp-open');

let editingFolder = null;
function openFolderModal(f) {
    editingFolder = f || null;
    const $ = (id) => document.getElementById(id);
    $('folder-modal-title').textContent = f ? 'Sửa đợt thực hành' : 'Đợt thực hành mới';
    $('folder-name').value = f?.ten || '';
    $('folder-dept').value = f?.khoa || '';
    $('folder-kind').value = f?.loai || '';
    $('folder-hospital').value = f?.benhVien || '';
    $('folder-from').value = f?.tuNgay || '';
    $('folder-to').value = f?.denNgay || '';
    $('folder-quota').value = f?.chiTieu || '';
    $('folder-delete').classList.toggle('hidden', !f);
    $('folder-modal').classList.remove('hidden');
    $('folder-name').focus();
}
const closeFolderModal = () => document.getElementById('folder-modal')?.classList.add('hidden');

/** Chuyển sang một đợt (id '' = tất cả, '__none__' = chưa xếp). slide = ±1: trượt danh sách vào từ phải/trái (vuốt đổi đợt) */
function goFolder(id, { slide = 0 } = {}) {
    folderId = id;
    savePrefs();
    closeFolderSheet();
    render();
    document.getElementById('wr-main')?.scrollTo({ top: 0 });
    if (slide) {
        const box = document.getElementById('medical-record-cards');
        box.classList.remove('slide-l', 'slide-r');
        void box.offsetWidth;
        box.classList.add(slide > 0 ? 'slide-l' : 'slide-r');
    }
}

/* Vuốt ngang đổi sang đợt kế / trước (điện thoại, máy tính bảng dọc). Không vòng lại ở hai đầu cho khỏi lạc. */
let swipeTimer = 0;
function stepFolder(dir) {
    const folders = sortedFolders();
    const loose = records.some(r => !r.thuMuc?.id);
    const order = ['', ...folders.map(f => String(f.id)), ...(loose && folders.length ? ['__none__'] : [])];
    const j = order.indexOf(String(folderId)) + dir;
    if (j < 0 || j >= order.length) return;
    goFolder(order[j], { slide: dir });
    const f = folders.find(x => String(x.id) === order[j]);
    const name = order[j] === '' ? 'Mọi đợt' : order[j] === '__none__' ? 'Chưa xếp vào đợt' : (f?.ten || 'Đợt thực hành');
    const el = document.getElementById('wr-swipe');
    if (!el) return;
    el.innerHTML = `<span>${dir < 0 ? '<i class="fas fa-chevron-left"></i>' : ''}${esc(name)}${dir > 0 ? '<i class="fas fa-chevron-right"></i>' : ''}</span>`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(swipeTimer);
    swipeTimer = setTimeout(() => el.classList.remove('on'), 1200);
}

function setupFolders() {
    document.getElementById('folder-new')?.addEventListener('click', () => { closeFolderSheet(); openFolderModal(null); });

    const pick = (id) => goFolder(id);
    const list = document.getElementById('folder-list');
    list?.addEventListener('click', (e) => {
        if (e.target.closest('[data-folder-new]')) { closeFolderSheet(); return openFolderModal(null); }
        const ed = e.target.closest('[data-folder-edit]');
        if (ed) { closeFolderSheet(); return openFolderModal(getFolder(ed.dataset.folderEdit)); }
        const row = e.target.closest('[data-folder]');
        if (row) pick(row.dataset.folder);
    });
    list?.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-folder]')) {
            e.preventDefault();
            pick(e.target.dataset.folder);
        }
    });
    document.getElementById('folder-chips')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-folder-new]')) return openFolderModal(null);
        const c = e.target.closest('[data-chip]');
        if (c) pick(c.dataset.chip);
    });
    // Nút "Mở đợt" ở tiêu đề mỗi nhóm (đang xem Tất cả)
    document.getElementById('medical-record-cards')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-goto-folder]');
        if (b) pick(b.dataset.gotoFolder);
    });

    document.getElementById('scope-edit')?.addEventListener('click', () => openFolderModal(getFolder(folderId)));
    // Điện thoại: bấm tên phạm vi để mở danh sách đợt (máy tính đã có cột trái)
    document.getElementById('folder-switch')?.addEventListener('click', () => {
        if (window.innerWidth < 1024) openFolderSheet();
    });
    document.getElementById('fp-backdrop')?.addEventListener('click', closeFolderSheet);

    document.getElementById('folder-modal')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-folder-close]')) closeFolderModal();
    });

    document.getElementById('folder-save')?.addEventListener('click', async () => {
        const $ = (id) => document.getElementById(id);
        const ten = $('folder-name').value.trim();
        if (!ten) { $('folder-name').focus(); return showToast('Nhập tên đợt thực hành trước.', 'warning'); }
        const f = {
            id: editingFolder?.id || newFolderId(), ten,
            khoa: $('folder-dept').value.trim(),
            loai: $('folder-kind').value,
            benhVien: $('folder-hospital').value.trim(),
            tuNgay: $('folder-from').value,
            denNgay: $('folder-to').value,
            chiTieu: Math.max(0, parseInt($('folder-quota').value, 10) || 0) || ''
        };
        saveFolder(f);
        if (editingFolder) {
            for (const r of records.filter(x => String(x.thuMuc?.id) === String(f.id))) {
                r.thuMuc = { ...f };
                await saveRecord(r);
            }
        }
        closeFolderModal();
        folderId = f.id;
        savePrefs();
        await reload();
        showToast(editingFolder ? 'Đã cập nhật đợt thực hành.' : 'Đã tạo đợt — bệnh án tạo trong đây sẽ tự điền khoa và bệnh viện.', 'success');
    });

    document.getElementById('folder-delete')?.addEventListener('click', async () => {
        if (!editingFolder) return;
        const n = countIn(editingFolder.id);
        if (n && !confirm(`Đợt này còn ${n} bệnh án. Xóa đợt thì bệnh án vẫn còn, chỉ chuyển sang "Chưa xếp vào đợt". Tiếp tục?`)) return;
        for (const r of records.filter(x => String(x.thuMuc?.id) === String(editingFolder.id))) {
            delete r.thuMuc;
            await saveRecord(r);
        }
        deleteFolder(editingFolder.id);
        closeFolderModal();
        folderId = '';
        savePrefs();
        await reload();
        showToast('Đã xóa đợt thực hành.', 'success');
    });
}

/** Chuyển bệnh án vào thư mục — nhận 1 id hoặc mảng id (id thư mục rỗng = bỏ ra khỏi mọi thư mục) */
async function moveRecord(recId, toFolderId) {
    const ids = [].concat(recId).map(String);
    const f = toFolderId ? getFolder(toFolderId) : null;
    const before = [];
    for (const id of ids) {
        const rec = records.find(r => String(r.id) === id);
        if (!rec) continue;
        before.push([id, rec.thuMuc ? { ...rec.thuMuc } : null]);
        if (f) rec.thuMuc = { ...f }; else delete rec.thuMuc;
        await saveRecord(rec);
    }
    if (!before.length) return;
    await reload();
    const what = ids.length > 1 ? `${before.length} bệnh án ` : '';
    undoToast(f ? `Đã chuyển ${what}vào "${f.ten}".` : `Đã bỏ ${what}khỏi đợt thực hành.`, async () => {
        for (const [id, old] of before) {
            const back = records.find(r => String(r.id) === id);
            if (!back) continue;
            if (old) back.thuMuc = old; else delete back.thuMuc;
            await saveRecord(back);
        }
        await reload();
    });
}

let movingId = null;
function openMoveModal(recId) {
    movingId = recId;
    const ids = [].concat(recId).map(String);
    const rec = records.find(r => String(r.id) === ids[0]);
    const folders = sortedFolders();
    document.getElementById('move-subject').textContent = ids.length > 1
        ? `${ids.length} bệnh án đã chọn`
        : (rec?.hanhChinh?.hoTen || 'Bệnh án chưa đặt tên')
        + (rec?.thuMuc?.ten ? ` · đang ở "${rec.thuMuc.ten}"` : ' · chưa xếp vào đợt');
    const cur = ids.length > 1 ? '__nhieu__' : String(rec?.thuMuc?.id || '');
    document.getElementById('move-list').innerHTML =
        folders.map(f => `<button class="move-opt${cur === String(f.id) ? ' is-current' : ''}" data-move="${esc(f.id)}" style="--fc:${folderKind(f)[1]};--fc-soft:${folderKind(f)[2]};--fc-ink:${folderKind(f)[3]}">
            <i class="fas fa-folder"></i><span><b>${esc(f.ten || 'Đợt thực hành')}</b><small>${esc(folderMeta(f)) || 'Chưa điền khoa / bệnh viện'}</small></span></button>`).join('')
        + `<button class="move-opt${cur ? '' : ' is-current'}" data-move="">
            <i class="fas fa-inbox"></i><span><b>Không thuộc đợt nào</b><small>Để riêng ở mục "Chưa xếp vào đợt"</small></span></button>`;
    document.getElementById('move-modal').classList.remove('hidden');
}
const closeMoveModal = () => document.getElementById('move-modal')?.classList.add('hidden');

function setupMove() {
    document.getElementById('move-modal')?.addEventListener('click', async (e) => {
        if (e.target.closest('[data-move-close]')) return closeMoveModal();
        if (e.target.closest('#move-new')) { closeMoveModal(); return openFolderModal(null); }
        const opt = e.target.closest('[data-move]');
        if (!opt) return;
        closeMoveModal();
        await moveRecord(movingId, opt.dataset.move);
    });

    const cards = document.getElementById('medical-record-cards');
    cards?.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.rec-card');
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
    });
    cards?.addEventListener('dragend', (e) => e.target.closest('.rec-card')?.classList.remove('is-dragging'));

    const chips = document.getElementById('folder-list');
    chips?.addEventListener('dragover', (e) => {
        const chip = e.target.closest('[data-folder]');
        if (!chip || chip.dataset.folder === '__none__') return;
        e.preventDefault();
        chip.classList.add('is-drop');
    });
    chips?.addEventListener('dragleave', (e) => e.target.closest('[data-folder]')?.classList.remove('is-drop'));
    chips?.addEventListener('drop', async (e) => {
        const chip = e.target.closest('[data-folder]');
        if (!chip || chip.dataset.folder === '__none__') return;
        e.preventDefault();
        chip.classList.remove('is-drop');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        await moveRecord(selected.has(String(id)) ? [...selected] : id, chip.dataset.folder);
    });
}

/* ================= Chọn / thao tác hàng loạt ================= */
function renderBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    // Hiện suốt chế độ chọn (kể cả 0 thẻ) — nút × thoát luôn ở đó, bỏ chọn hết không bị kẹt lại
    bar.classList.toggle('hidden', !selectMode);   // để CSS lo bố cục: dàn ngang ở máy tính, lưới đáy màn ở điện thoại
    document.getElementById('bulk-count').textContent = selected.size ? `${selected.size} đã chọn` : 'Chạm vào thẻ để chọn';
    const st = document.getElementById('select-toggle');
    if (st) {
        st.classList.toggle('on', selectMode);
        st.setAttribute('aria-pressed', selectMode ? 'true' : 'false');
    }
}

function toggleSelect(id) {
    const key = String(id);
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    document.querySelector(`.rec-card[data-id="${CSS.escape(key)}"]`)?.classList.toggle('selected', selected.has(key));
    renderBulkBar();
}

function setSelectMode(on) {
    selectMode = on;
    if (!on) {
        selected.clear();
        document.querySelectorAll('.rec-card.selected').forEach(c => c.classList.remove('selected'));
    }
    document.getElementById('medical-record-cards')?.classList.toggle('select-mode', on);
    document.body.classList.toggle('select-on', on);   // ẩn nút tạo nổi để không che thanh thao tác
    renderResume();                                    // đang chọn hàng loạt thì giấu thẻ "viết tiếp"
    renderBulkBar();
}

/** Đổi một trường ở tất cả bệnh án đang chọn, có hoàn tác */
async function bulkField(key, value, label) {
    const ids = [...selected];
    if (!ids.length) return;
    const before = ids.map(id => [id, records.find(r => String(r.id) === id)?.[key]]);
    for (const id of ids) {
        const rec = records.find(r => String(r.id) === id);
        if (!rec) continue;
        rec[key] = value;
        await saveRecord(rec);
    }
    await reload();
    undoToast(`Đã đổi ${label} cho ${ids.length} bệnh án.`, async () => {
        for (const [id, old] of before) {
            const rec = records.find(r => String(r.id) === id);
            if (!rec) continue;
            if (old === undefined) delete rec[key]; else rec[key] = old;
            await saveRecord(rec);
        }
        await reload();
    });
}

async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Xóa ${ids.length} bệnh án đã chọn?`)) return;
    const backups = ids.map(id => records.find(r => String(r.id) === id))
        .filter(Boolean).map(r => JSON.parse(JSON.stringify(r)));
    for (const id of ids) await deleteRecord(id);
    selected.clear();
    await reload();
    undoToast(`Đã xóa ${backups.length} bệnh án.`, async () => {
        for (const b of backups) await saveRecord(b);
        await reload();
        showToast('Đã khôi phục bệnh án.', 'success');
    });
}

function setupBulk() {
    document.getElementById('select-toggle')?.addEventListener('click', () => {
        document.getElementById('more-menu')?.classList.add('hidden');
        setSelectMode(!selectMode);
    });
    document.getElementById('bulk-exit')?.addEventListener('click', () => setSelectMode(false));

    document.getElementById('bulk-all')?.addEventListener('click', () => {
        const ids = visibleRecords().map(r => String(r.id));
        const all = ids.every(id => selected.has(id));
        ids.forEach(id => all ? selected.delete(id) : selected.add(id));
        document.querySelectorAll('.rec-card').forEach(c =>
            c.classList.toggle('selected', selected.has(String(c.dataset.id))));
        renderBulkBar();
    });

    document.getElementById('bulk-move')?.addEventListener('click', () => {
        if (selected.size) openMoveModal([...selected]);
    });

    document.getElementById('bulk-status')?.addEventListener('change', async (e) => {
        const v = e.target.value;
        e.target.value = '';
        if (v) await bulkField('status', v, 'trạng thái');
    });

    document.getElementById('bulk-kind')?.addEventListener('change', async (e) => {
        const v = e.target.value;
        e.target.value = '';
        if (v) await bulkField('loaiBenhAn', v, 'loại bệnh án');
    });

    document.getElementById('bulk-delete')?.addEventListener('click', bulkDelete);
}

/* ================= Toast hoàn tác ================= */
function undoToast(message, onUndo, ms = 6000) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'pointer-events-auto bg-gray-800 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 text-sm';
    el.innerHTML = `<span>${esc(message)}</span>`;
    const btn = document.createElement('button');
    btn.className = 'font-bold text-pink-300 hover:text-pink-200 whitespace-nowrap';
    btn.textContent = 'Hoàn tác';
    el.appendChild(btn);
    box.appendChild(el);
    const timer = setTimeout(() => el.remove(), ms);
    btn.addEventListener('click', () => { clearTimeout(timer); el.remove(); onUndo(); });
}

/* ================= Hành động ================= */
function createNew() {
    createNewIn(folderId && folderId !== '__none__' ? folderId : '');
}
function createNewIn(fid) {
    const q = fid ? '&folder=' + encodeURIComponent(fid) : '';
    location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent('BA-' + Date.now()) + q;
}

/* Trước khi Firebase trả lời thì isSignedIn() còn là false — đừng vội báo
   "chỉ lưu trên máy này", người dùng tưởng mất đồng bộ. */
let authReady = false;

/** Viên trạng thái đồng bộ ở đầu trang: ok (bạc hà) · local (vàng bơ, mời đăng nhập) · busy (đang chạy) */
function setSync(state, html, title = '') {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.dataset.state = state;
    el.innerHTML = html;
    el.title = title;
}
const syncBusy = () => setSync('busy', `<i class="fas fa-circle-notch fa-spin"></i> Đang đồng bộ…`);

/** "14:32" hôm nay, "05/10 14:32" ngày khác */
function fmtAt(ms) {
    if (!ms) return '';
    const d = new Date(ms), t = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${t}`;
}

/* Trạng thái đồng bộ nói THẬT: đã lên mây lúc mấy giờ · còn bao nhiêu bản chưa lên · đang ngoại tuyến */
function updateSyncStatus() {
    if (!authReady) return;
    const i = syncInfo();
    if (!i.signedIn) {
        setSync('local', `<i class="fas fa-hdd"></i> Chỉ lưu trên máy này · <a href="../../index.html">đăng nhập để đồng bộ</a>`);
    } else if (!i.online) {
        setSync('local', `<i class="fas fa-plane"></i> Ngoại tuyến${i.pending ? ` · ${i.pending} bản sẽ lên mây khi có mạng` : ' · bệnh án vẫn lưu trên máy'}`,
            'Mất mạng: bạn cứ viết, bệnh án lưu trên máy và tự đồng bộ khi có mạng lại');
    } else if (i.pending) {
        setSync('busy', `<i class="fas fa-cloud-arrow-up"></i> ${i.pending} bản chưa lên mây · bấm để đồng bộ`,
            'Có bệnh án đã sửa mà chưa chắc đã lên đám mây — bấm để đồng bộ ngay');
    } else {
        setSync('ok', `<i class="fas fa-cloud"></i> Đã đồng bộ${i.lastSync ? ' · ' + fmtAt(i.lastSync) : ''}`,
            'Bệnh án đã lưu lên đám mây · bấm để đồng bộ ngay (kiểm tra cả máy khác)');
    }
}

async function reload({ cloud = false } = {}) {
    records = sortRecords(listLocal());
    render();
    if (cloud) {
        syncBusy();
        records = await syncFromCloud();
        render();
    }
    updateSyncStatus();
}

/* Đồng bộ hai chiều theo yêu cầu: kéo bệnh án của máy khác về, đẩy bệnh án của
   máy này lên, rồi nói rõ được mấy bản — chạy ngầm im lặng thì người dùng không
   biết đã xong hay chưa mà đóng app giữa chừng. */
function setupSyncButton() {
    const btn = document.getElementById('sync-now');
    if (!btn) return;
    const icon = btn.querySelector('i');
    // Bấm viên "Đã đồng bộ" ở đầu trang = Đồng bộ ngay (khỏi mở menu ⚙)
    document.getElementById('sync-status')?.addEventListener('click', (e) => {
        if (!e.target.closest('a') && isSignedIn()) btn.click();
    });
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        document.getElementById('more-menu')?.classList.add('hidden');
        btn.disabled = true;
        icon.className = 'fas fa-circle-notch fa-spin';
        syncBusy();
        const r = await syncNow({ wait: true, full: true });     // bấm tay = soát đầy đủ cả kho trên cloud
        records = sortRecords(r.merged);
        render();
        updateSyncStatus();
        icon.className = 'fas fa-cloud-arrow-up';
        btn.disabled = false;
        if (!r.signedIn) {
            showToast('Chưa đăng nhập nên chưa đồng bộ được — đăng nhập rồi bấm lại.', 'warning', 6000);
        } else if (r.error) {
            // Kèm mã lỗi Firestore: permission-denied = rules chưa mở / chưa deploy,
            // unavailable = mất mạng hoặc Firebase bị chặn, unauthenticated = phiên hỏng.
            const ma = r.error?.code || r.error?.message || 'không rõ';
            showToast(`Không đồng bộ được — lỗi "${ma}". Kiểm tra mạng, hoặc quyền Firestore chưa được deploy.`, 'error', 9000);
        } else if (!r.pulled && !r.pushed && !r.removed && !r.foldersChanged) {
            showToast('Hai bên đã giống nhau, không có gì phải đồng bộ.', 'info');
        } else {
            const bits = [r.pulled && `tải về ${r.pulled}`, r.pushed && `đẩy lên ${r.pushed}`, r.removed && `xóa ${r.removed} (đã xóa ở máy khác)`].filter(Boolean);
            showToast(`Đã đồng bộ: ${bits.join(', ') || 'cập nhật đợt thực hành'}.`, 'success', 6000);
        }
    });
}

function setupActions() {
    setupSyncButton();
    document.getElementById('create-new-record')?.addEventListener('click', createNew);

    document.getElementById('search-record')?.addEventListener('input', (e) => {
        keyword = e.target.value.trim();
        qTokens = fold(keyword).split(/\s+/).filter(Boolean);
        render();
    });

    // Đổi chế độ xem: thẻ đầy đủ ⇄ danh sách gọn (nhớ lại cho lần sau)
    document.getElementById('view-toggle')?.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-view]');
        if (b) setView(b.dataset.view);
    });

    document.getElementById('resume-slot')?.addEventListener('click', (e) => {
        const n = e.target.closest('[data-new-in]');
        if (n) return createNewIn(n.dataset.newIn);
        const b = e.target.closest('[data-resume]');
        if (b) location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent(b.dataset.resume)
            + (b.dataset.tab ? '&tab=' + encodeURIComponent(b.dataset.tab) : '');
    });

    const groupSel = document.getElementById('group-by');
    if (groupSel) groupSel.value = groupBy;
    groupSel?.addEventListener('change', (e) => {
        groupBy = e.target.value;
        savePrefs();
        render();
    });

    const sortSel = document.getElementById('sort-record');
    if (sortSel) sortSel.value = sortMode;
    sortSel?.addEventListener('change', (e) => {
        sortMode = e.target.value;
        savePrefs();
        render();
    });

    // Bộ lọc trạng thái nằm luôn trên 3 thẻ tổng quan — vùng bấm to, vừa ngón tay
    document.getElementById('stat-filter')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-filter]');
        if (!b) return;
        filter = b.dataset.filter;
        savePrefs();
        render();
    });

    // Menu sao lưu
    const menuBtn = document.getElementById('more-menu-btn');
    const menu = document.getElementById('more-menu');
    menuBtn?.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    document.addEventListener('click', () => menu?.classList.add('hidden'));
    menu?.addEventListener('click', (e) => e.stopPropagation());

    /* Chế độ hướng dẫn: một công tắc cho toàn bộ app, mọi bệnh án dùng chung.
       Tắt đi thì trang viết bệnh án bỏ hết câu chỉ dẫn, chỉ còn ô nhập. */
    const guideBtn = document.getElementById('toggle-guide');
    const guideTag = document.getElementById('guide-state');
    const paintGuide = () => {
        if (!guideTag) return;
        const on = guideOn();
        guideTag.textContent = on ? 'Bật' : 'Tắt';
        guideTag.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full '
            + (on ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-500');
    };
    paintGuide();
    guideBtn?.addEventListener('click', () => {
        const on = setGuide(!guideOn());
        paintGuide();
        showToast(on
            ? 'Đã bật hướng dẫn — các câu chỉ dẫn sẽ hiện lại trong bệnh án.'
            : 'Đã tắt hướng dẫn — trang viết bệnh án chỉ còn ô nhập.', 'success');
    });

    document.getElementById('export-json')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        const n = exportJson();
        showToast(n ? `Đã xuất ${n} bệnh án ra file.` : 'Chưa có bệnh án nào để xuất.', n ? 'success' : 'warning');
    });
    const fileInput = document.getElementById('import-file');
    document.getElementById('import-json')?.addEventListener('click', () => {
        menu.classList.add('hidden');
        fileInput.click();
    });
    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const n = await importJson(file);
            await reload();
            showToast(n ? `Đã nhập ${n} bệnh án.` : 'Không có bệnh án nào mới trong file.', n ? 'success' : 'info');
        } catch (err) {
            showToast('File không đọc được: ' + err.message, 'error');
        }
    });

    // Thao tác trên thẻ
    document.getElementById('medical-record-cards')?.addEventListener('click', async (e) => {
        if (selectMode) {
            const card = e.target.closest('.rec-card');
            if (card) toggleSelect(card.dataset.id);
            return;
        }
        const btn = e.target.closest('button[data-id]');
        if (!btn) {
            const card = e.target.closest('.card-open')?.closest('article');
            if (!card) return;
            const page = card.dataset.done === '1' ? 'xem-benh-an.html' : 'tao-benh-an.html';
            location.href = '../medical-record/' + page + '?id=' + encodeURIComponent(card.dataset.id);
            return;
        }
        const id = btn.dataset.id;

        if (btn.classList.contains('menu-record')) {
            const card = btn.closest('.rec-card');
            const wasOpen = card.classList.contains('menu-open');
            document.querySelectorAll('.rec-card.menu-open').forEach(c => c.classList.remove('menu-open'));
            card.classList.toggle('menu-open', !wasOpen);
            return;
        }
        btn.closest('.rec-card')?.classList.remove('menu-open');

        if (btn.classList.contains('view-record')) {
            location.href = '../medical-record/xem-benh-an.html?id=' + encodeURIComponent(id);
        } else if (btn.classList.contains('edit-record') || btn.classList.contains('next-step')) {
            location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent(id)
                + (btn.dataset.tab ? '&tab=' + encodeURIComponent(btn.dataset.tab) : '');
        } else if (btn.classList.contains('pin-record')) {
            const on = togglePin(id);
            showToast(on ? 'Đã ghim lên đầu danh sách.' : 'Đã bỏ ghim.', 'success');
        } else if (btn.classList.contains('move-record')) {
            openMoveModal(id);
        } else if (btn.classList.contains('track-record')) {
            location.href = '../medical-record/tao-benh-an.html?tab=theo-doi&id=' + encodeURIComponent(id);
        } else if (btn.classList.contains('dup-record')) {
            const src = records.find(r => String(r.id) === String(id));
            if (!src) return;
            const copy = JSON.parse(JSON.stringify(src));
            copy.id = 'BA-' + Date.now();
            copy.status = 'Đang chỉnh sửa';
            copy.hanhChinh = copy.hanhChinh || {};
            copy.hanhChinh.hoTen = (copy.hanhChinh.hoTen || '') + ' (BẢN SAO)';
            await saveRecord(copy);
            await reload();
            showToast('Đã nhân bản bệnh án.', 'success');
        } else if (btn.classList.contains('delete-record')) {
            const victim = records.find(r => String(r.id) === String(id));
            if (!victim) return;
            const backup = JSON.parse(JSON.stringify(victim));
            await deleteRecord(id);
            await reload();
            undoToast('Đã xóa bệnh án "' + (victim.hanhChinh?.hoTen || 'Chưa đặt tên') + '".', async () => {
                await saveRecord(backup);
                await reload();
                showToast('Đã khôi phục bệnh án.', 'success');
            });
        }
    });
}

function setView(mode) {
    if (mode !== 'grid' && mode !== 'compact') return;
    viewMode = mode;
    savePrefs();
    render();
}

/* ================= Phím tắt (máy tính) =================
   / hoặc s: tìm · n: bệnh án mới · v: đổi chế độ xem · Esc: thoát/xóa tìm
   j / k: xuống / lên một thẻ · Enter hoặc o: mở · e: viết tiếp/sửa · p: ghim */
let kbId = null;
const kbCard = () => (kbId ? [...document.querySelectorAll('#medical-record-cards .rec-card')].find(c => c.dataset.id === kbId) : null);
function kbMove(dir) {
    const cards = [...document.querySelectorAll('#medical-record-cards .rec-card')];
    if (!cards.length) return;
    let i = cards.findIndex(c => c.dataset.id === kbId);
    i = i < 0 ? (dir > 0 ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, i + dir));
    cards.forEach(c => c.classList.remove('kb'));
    kbId = cards[i].dataset.id;
    cards[i].classList.add('kb');
    cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function kbAct(kind) {
    const c = kbCard();
    if (!c) return false;
    const id = encodeURIComponent(c.dataset.id);
    if (kind === 'pin') { togglePin(c.dataset.id); return true; }
    if (kind === 'edit') {
        const tab = c.querySelector('.edit-record')?.dataset.tab;
        location.href = '../medical-record/tao-benh-an.html?id=' + id + (tab ? '&tab=' + encodeURIComponent(tab) : '');
    } else {
        location.href = '../medical-record/' + (c.dataset.done === '1' ? 'xem-benh-an.html' : 'tao-benh-an.html') + '?id=' + id;
    }
    return true;
}

function setupKeys() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        const search = document.getElementById('search-record');

        if (e.key === 'Escape') {
            const modal = document.querySelector('#move-modal:not(.hidden), #folder-modal:not(.hidden)');
            if (modal) return modal.classList.add('hidden');
            if (sheetOpen()) return closeFolderSheet();
            if (!document.getElementById('more-menu')?.classList.contains('hidden'))
                return document.getElementById('more-menu').classList.add('hidden');
            if (document.querySelector('.rec-card.menu-open'))
                return document.querySelectorAll('.rec-card.menu-open').forEach(c => c.classList.remove('menu-open'));
            if (selectMode) return setSelectMode(false);
            if (keyword) { search.value = ''; keyword = ''; qTokens = []; search.blur(); render(); }
            return;
        }
        if (typing) return;
        if (e.key === '/' || e.key === 's') { e.preventDefault(); search?.focus(); search?.select(); }
        else if (e.key === 'n') { e.preventDefault(); createNew(); }
        else if (e.key === 'v') { e.preventDefault(); setView(viewMode === 'grid' ? 'compact' : 'grid'); }
        else if (e.key === 'j') { e.preventDefault(); kbMove(1); }
        else if (e.key === 'k') { e.preventDefault(); kbMove(-1); }
        else if ((e.key === 'Enter' || e.key === 'o') && kbCard() && !t.closest?.('button, a')) { e.preventDefault(); kbAct('open'); }
        else if (e.key === 'e' && kbCard()) { e.preventDefault(); kbAct('edit'); }
        else if (e.key === 'p' && kbCard()) { e.preventDefault(); kbAct('pin'); }
    });
}

/* ================= Điện thoại: cử chỉ và thanh công cụ ================= */
function setupTouch() {
    const main = document.getElementById('wr-main');
    const tools = document.getElementById('wr-tools');
    const fab = document.getElementById('create-new-record');
    const menu = document.getElementById('more-menu');
    const narrow = matchMedia('(max-width: 1023px)');

    /* Cuộn xuống: giấu thanh tìm/lọc và thu nút tạo thành nút tròn, nhường chỗ cho danh sách.
       Cuộn lên một chút là hiện lại. Chỉ bật/tắt class khi đổi trạng thái — không ghi style mỗi khung hình. */
    let last = 0, raf = 0;
    main?.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            const y = main.scrollTop, dy = y - last;
            fab?.classList.toggle('fab-mini', y > 140);
            if (Math.abs(dy) < 8) return;
            last = y;
            const busy = document.activeElement?.id === 'search-record' || !menu?.classList.contains('hidden');
            tools?.classList.toggle('tuck', narrow.matches && dy > 0 && y > 260 && !busy);
            tools?.classList.toggle('lifted', y > 60);
        });
    }, { passive: true });

    // Menu ⚙ trên điện thoại là bảng trượt từ đáy: cờ trên body để hiện nền mờ và giấu nút tạo
    if (menu) new MutationObserver(() => document.body.classList.toggle('more-open', !menu.classList.contains('hidden')))
        .observe(menu, { attributes: true, attributeFilter: ['class'] });

    /* Nhấn giữ thẻ ~0,5 giây → vào chế độ chọn nhiều với thẻ đó (chỉ cảm ứng; chuột đã có kéo thả) */
    const cards = document.getElementById('medical-record-cards');
    let timer = 0, x0 = 0, y0 = 0, swallow = false;
    const stop = () => { clearTimeout(timer); timer = 0; };
    cards?.addEventListener('pointerdown', (e) => {
        swallow = false;
        if (e.pointerType === 'mouse' || selectMode || e.target.closest('button')) return;
        const card = e.target.closest('.rec-card');
        if (!card) return;
        x0 = e.clientX; y0 = e.clientY;
        timer = setTimeout(() => {
            timer = 0; swallow = true;
            setSelectMode(true);
            toggleSelect(card.dataset.id);
            navigator.vibrate?.(12);
        }, 500);
    });
    cards?.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
    ['pointerup', 'pointercancel'].forEach(t => cards?.addEventListener(t, stop));
    // Nhả tay sau khi giữ, trình duyệt có thể bắn thêm một click — nuốt đi kẻo bỏ chọn ngay thẻ vừa chọn
    cards?.addEventListener('click', (e) => {
        if (swallow) { swallow = false; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    cards?.addEventListener('contextmenu', (e) => { if (swallow || timer) e.preventDefault(); });

    /* Vuốt ngang trên vùng bệnh án → đợt kế / trước. Bỏ qua khi: đang chọn nhiều, bắt đầu từ hàng chip / ô nhập /
       menu (có cuộn ngang riêng), sát mép màn hình (cử chỉ Back của iOS), vuốt chậm hoặc chéo. */
    const body = document.querySelector('.wr-body');
    let sx = 0, sy1 = 0, st = 0, tracking = false;
    body?.addEventListener('touchstart', (e) => {
        tracking = false;
        if (e.touches.length !== 1 || selectMode || !narrow.matches) return;
        if (e.target.closest('.wr-chips, input, select, textarea, .wr-menu, .rc-menu, .wr-seg')) return;
        const x = e.touches[0].clientX;
        if (x < 24 || x > window.innerWidth - 24) return;
        sx = x; sy1 = e.touches[0].clientY; st = Date.now(); tracking = true;
    }, { passive: true });
    body?.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy1;
        if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - st > 650) return;
        stepFolder(dx < 0 ? 1 : -1);
    }, { passive: true });

    /* Kéo xuống khi đang ở ĐẦU trang → đồng bộ ngay (như làm tươi ở app). CSS tắt kéo-làm-tươi gốc của trình duyệt
       (overscroll-behavior-y: contain) nên không bị hai cái chồng nhau. */
    const ptr = document.getElementById('wr-ptr');
    let py = null;
    const ptrReset = () => { ptr?.classList.remove('on', 'ready'); ptr?.style.removeProperty('--pull'); };
    main?.addEventListener('touchstart', (e) => {
        py = (main.scrollTop <= 0 && narrow.matches && e.touches.length === 1 && !selectMode && sheetOpen() === false
            && !e.target.closest('.wr-chips, .wr-menu, input, select')) ? e.touches[0].clientY : null;
    }, { passive: true });
    main?.addEventListener('touchmove', (e) => {
        if (py == null || !ptr) return;
        const dy = e.touches[0].clientY - py;
        if (dy <= 8 || main.scrollTop > 0) return void ptrReset();
        const pull = Math.min(dy * 0.5, 84);
        ptr.style.setProperty('--pull', pull + 'px');
        ptr.classList.add('on');
        ptr.classList.toggle('ready', pull >= 56);
    }, { passive: true });
    main?.addEventListener('touchend', () => {
        if (py == null) return;
        py = null;
        const ready = ptr?.classList.contains('ready');
        ptrReset();
        if (!ready) return;
        navigator.vibrate?.(10);
        if (isSignedIn()) document.getElementById('sync-now')?.click();
        else showToast('Đăng nhập để đồng bộ bệnh án giữa các máy.', 'warning');
    });
    main?.addEventListener('touchcancel', () => { py = null; ptrReset(); });

    // Bảng đợt (trượt từ đáy): đang ở đầu danh sách mà kéo xuống quá 80px thì đóng
    const pane = document.getElementById('folder-pane');
    let sy = null;
    pane?.addEventListener('touchstart', (e) => {
        sy = narrow.matches && pane.classList.contains('open') && pane.scrollTop <= 0 ? e.touches[0].clientY : null;
    }, { passive: true });
    pane?.addEventListener('touchmove', (e) => {
        if (sy == null) return;
        const dy = e.touches[0].clientY - sy;
        pane.classList.add('drag');
        pane.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    }, { passive: true });
    pane?.addEventListener('touchend', (e) => {
        if (sy == null) return;
        const dy = e.changedTouches[0].clientY - sy;
        sy = null;
        pane.classList.remove('drag');
        pane.style.transform = '';
        if (dy > 80) closeFolderSheet();
    });
}

/* ================= Đồng bộ nhiều máy: nghe cloud + tự làm tươi =================
   Máy khác lưu / xóa / đổi đợt / ghim → record-store báo qua watchCloud (1 listener doc meta) và trang vẽ lại
   NGAY, không cần F5. Mở lại tab sau một lúc / có mạng lại thì đồng bộ nhẹ (1 lượt đọc nếu không có gì đổi). */
let unwatch = null;
function applyRemote(r, quiet) {
    if (!r || r.error) return updateSyncStatus();
    const before = records.length;
    records = sortRecords(r.merged);
    render();
    updateSyncStatus();
    if (quiet) return;
    const bits = [r.pulled && `cập nhật ${r.pulled} bệnh án`, r.removed && `bỏ ${r.removed} bệnh án đã xóa`, r.foldersChanged && 'đợt thực hành'].filter(Boolean);
    if (bits.length) showToast('Từ máy khác: ' + bits.join(', ') + '.', 'info', 4500);
    void before;
}
function watchRemote(on) {
    unwatch?.(); unwatch = null;
    if (on) unwatch = watchCloud((r) => applyRemote(r, false));
}
let lastTick = 0;
async function refreshQuiet() {
    if (!isSignedIn() || document.visibilityState !== 'visible' || Date.now() - lastTick < 20000) return;
    lastTick = Date.now();
    const r = await syncNow({ wait: true });
    applyRemote(r, r.pulled + r.removed === 0);
}
document.addEventListener('visibilitychange', refreshQuiet);
addEventListener('online', () => { lastTick = 0; refreshQuiet(); });
addEventListener('online', updateSyncStatus);
addEventListener('offline', updateSyncStatus);
setInterval(updateSyncStatus, 30000);        // đổi "vừa xong"/giờ, và hiện số bản chờ khi người dùng đang viết ở tab khác

/* ================= Khởi động ================= */
loadPrefs();
setupChrome();
setupActions();
setupFolders();
setupMove();
setupBulk();
setupKeys();
setupTouch();
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-record')) {
        document.querySelectorAll('.rec-card.menu-open').forEach(c => c.classList.remove('menu-open'));
    }
});

/* Vẽ ngay danh sách trong máy, đừng chờ Firebase trả lời: mạng 3G mà phải đợi
   xác thực xong mới thấy bệnh án thì tưởng app treo. */
reload();

// Lắng nghe phiên đăng nhập: tự động cập nhật avatar, tên người dùng và đồng bộ đám mây
onSessionUser(async (user) => {
    authReady = true;
    const name = user ? (user.displayName || (user.email || '').split('@')[0] || 'Bạn') : 'Đăng nhập';
    const avatar = (user && user.photoURL) ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D8BFD8&color=fff`;
    ['user-name', 'user-name-sidebar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    });
    ['user-avatar', 'user-avatar-sidebar', 'user-avatar-mobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = avatar;
    });
    if (!user) {
        const goLogin = () => { window.location.href = '../../index.html'; };
        const menu = document.getElementById('user-menu-button');
        if (menu) { menu.style.cursor = 'pointer'; menu.onclick = goLogin; }
        const mob = document.getElementById('user-avatar-mobile');
        if (mob) { mob.style.cursor = 'pointer'; mob.onclick = goLogin; }
    } else {
        // Bấm tên/avatar → trang hồ sơ (giống trang chủ)
        const goProfile = () => { window.location.href = '../profile/profile.html'; };
        ['user-menu-button', 'user-avatar-mobile'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.style.cursor = 'pointer'; el.title = 'Hồ sơ cá nhân'; el.onclick = goProfile; }
        });
    }
    await reload({ cloud: !!user });
    watchRemote(!!user);
});
