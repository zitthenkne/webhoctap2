// waiting-room.js — Trang chờ: danh sách bệnh án
import { showToast } from '../../core/utils.js';
import { guideOn, setGuide } from '../../core/guide.js';
import { onSessionUser } from '../../core/auth-session.js';
import {
    listLocal, sortRecords, syncFromCloud, syncNow, deleteRecord, saveRecord,
    isSignedIn, exportJson, importJson
} from '../medical-record/record-store.js';
import {
    listFolders, saveFolder, deleteFolder, getFolder, newFolderId, mergeFolders, folderMeta
} from '../medical-record/folder-store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Sidebar + linh vật (giữ nguyên hành vi cũ) ================= */
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
    const syncSidebarWidth = () => {
        if (window.innerWidth >= 768) sidebar?.classList.remove('-translate-x-full');
        else sidebar?.classList.add('-translate-x-full');
        overlay?.classList.add('hidden');
    };
    window.addEventListener('resize', syncSidebarWidth);
    syncSidebarWidth();

    const squirrelMessages = [
        'Chúc bạn học tốt! 💪', 'Cố lên nhé, bạn làm được mà! 🐿️', 'Học vui như sóc nhảy cành!',
        'Đừng quên uống nước nhé! 💧', 'Bạn là số 1! ⭐', 'Kiến thức là hạt dẻ, hãy tích lũy mỗi ngày!',
        'Học tập chăm chỉ, thành công sẽ đến!', 'Tự tin lên nào! ✨', 'Hôm nay bạn đã cố gắng rất nhiều rồi!'
    ];
    const squirrel = document.getElementById('squirrel-floating');
    const msgBox = document.getElementById('squirrel-message');
    squirrel?.addEventListener('click', () => {
        if (!msgBox) return;
        msgBox.textContent = squirrelMessages[Math.floor(Math.random() * squirrelMessages.length)];
        msgBox.classList.remove('hidden');
        setTimeout(() => msgBox.classList.add('hidden'), 2200);
    });
}

/* ================= Tính % hoàn thiện =================
   Đếm theo danh sách mục bắt buộc của một bệnh án học thuật, không đếm theo
   số trường có sẵn trong dữ liệu — bản ghi thưa mà vẫn 100% là vô nghĩa. */
const SCORE_PATHS = [
    'hanhChinh.hoTen', 'hanhChinh.gioiTinh', 'hanhChinh.ngheNghiep', 'hanhChinh.diaChi',
    'hanhChinh.ngayVaoVien', 'hanhChinh.ngayLamBenhAn', 'hanhChinh.benhVien',
    'lyDoVaoVien', 'benhSu',
    'tienSu.noiKhoa', 'tienSu.ngoaiKhoa', 'tienSu.diUng', 'tienSu.thoiQuen', 'tienSu.giaDinh',
    'khamBenh.sinhTon.mach', 'khamBenh.sinhTon.huyetAp', 'khamBenh.sinhTon.nhietDo', 'khamBenh.sinhTon.nhipTho',
    'khamBenh.tongTrang', 'khamBenh.tim', 'khamBenh.phoi', 'khamBenh.bung', 'khamBenh.thanKinhCoXuongKhop',
    'tomTatBenhAn', 'datVanDe', 'chanDoanSoBo', 'chanDoanPhanBiet', 'bienLuanChanDoan',
    'canLamSangDeNghi', 'chanDoanXacDinh', 'huongDieuTri', 'tienLuong'
];
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

function completeness(rec) {
    let filled = SCORE_PATHS.filter(p => String(getPath(rec, p) ?? '').trim()).length;
    let total = SCORE_PATHS.length + 3;                       // + tuổi, lược qua cơ quan, cận lâm sàng
    if (String(rec.hanhChinh?.tuoi ?? rec.hanhChinh?.namSinh ?? '').trim()) filled++;
    if (Object.values(rec.luocQuaCoQuan || {}).some(v => String(v ?? '').trim())) filled++;
    if ((rec.canLamSang || []).length) filled++;
    return Math.min(100, Math.round(filled / total * 100));
}

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
let selectMode = false;
const selected = new Set();   // id các bệnh án đang chọn

const isDone = (r) => (r.status || 'Hoàn thành') === 'Hoàn thành';

function visibleRecords() {
    let out = records.filter(r => {
        if (folderId && String(r.thuMuc?.id || '') !== String(folderId)) return false;
        if (filter === 'done' && !isDone(r)) return false;
        if (filter === 'draft' && isDone(r)) return false;
        if (!keyword) return true;
        const hay = [
            r.hanhChinh?.hoTen, r.hanhChinh?.soPhong, r.hanhChinh?.roomNumber,
            r.hanhChinh?.soGiuong, r.hanhChinh?.bedNumber, r.hanhChinh?.benhVien,
            r.lyDoVaoVien, r.chanDoanSoBo, r.chanDoanXacDinh
        ].join(' ').toLowerCase();
        return hay.includes(keyword);
    });
    if (sortMode === 'name') {
        out.sort((a, b) => (a.hanhChinh?.hoTen || '').localeCompare(b.hanhChinh?.hoTen || '', 'vi'));
    } else {
        out = sortRecords(out);
        if (sortMode === 'old') out.reverse();
    }
    return out;
}

function renderStats() {
    const done = records.filter(isDone).length;
    document.getElementById('stat-total').textContent = records.length;
    document.getElementById('stat-done').textContent = done;
    document.getElementById('stat-draft').textContent = records.length - done;
}

function emptyState() {
    if (records.length === 0) return `
        <div class="col-span-full flex flex-col items-center justify-center py-14 text-center">
            <div class="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center mb-4"><i class="fas fa-notes-medical text-3xl text-pink-400"></i></div>
            <p class="text-gray-600 font-bold text-base">Chưa có bệnh án nào</p>
            <p class="text-gray-400 text-sm mt-1 max-w-xs">Bấm <b class="text-pink-500">+ Tạo bệnh án</b> để viết bệnh án đầu tiên. Bài viết được lưu tự động khi bạn gõ.</p>
            <button id="empty-create" class="mt-4 bg-pink-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-pink-600 active:scale-95 transition shadow-lg shadow-pink-200"><i class="fas fa-plus mr-1"></i> Tạo bệnh án</button>
        </div>`;
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <div class="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3"><i class="fas fa-search text-2xl text-pink-400"></i></div>
            <p class="text-gray-500 font-semibold">Không tìm thấy bệnh án phù hợp</p>
            <p class="text-gray-400 text-sm mt-1">Thử đổi từ khóa hoặc chọn lại bộ lọc.</p>
        </div>`;
}

const KINDS = {
    noi: ['Nội khoa', '#ec4899', '#fdf2f8', '#db2777'],
    ngoai: ['Ngoại khoa', '#3b82f6', '#eff6ff', '#2563eb'],
    san: ['Sản khoa', '#f43f5e', '#fff1f2', '#e11d48'],
    nhi: ['Nhi khoa', '#f59e0b', '#fffbeb', '#c2410c'],
    cc: ['Cấp cứu', '#ef4444', '#fef2f2', '#dc2626']
};

function ringHtml(pct) {
    const color = pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#f472b6';
    const r = 16, c = 2 * Math.PI * r;
    return `<span class="rc-ring" style="--pct-color:${color}" title="Mức độ hoàn thiện">
        <svg width="38" height="38" viewBox="0 0 38 38">
            <circle class="track" cx="19" cy="19" r="${r}" fill="none" stroke-width="4"></circle>
            <circle class="bar" cx="19" cy="19" r="${r}" fill="none" stroke-width="4"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}"></circle>
        </svg><span>${pct}%</span></span>`;
}

function cardHtml(rec) {
    const id = esc(rec.id);
    const h = rec.hanhChinh || {};
    const [kindName, , kindSoft, kindInk] = KINDS[rec.loaiBenhAn] || KINDS.noi;
    // Màu thẻ theo giới tính: nữ hồng, nam đỏ
    const gt = String(h.gioiTinh || '').trim();
    const isNu = /nữ/i.test(gt), isNam = /nam/i.test(gt);
    const sexGrad = isNu ? '#ec4899' : isNam ? '#2563eb' : '#8b5cf6';
    const sexIcon = isNu ? 'venus' : isNam ? 'mars' : 'genderless';
    const sexInk = isNu ? '#db2777' : isNam ? '#2563eb' : '#7c3aed';
    const hoTen = esc(h.hoTen) || 'Chưa đặt tên';
    const initial = esc((h.hoTen || '?').trim().charAt(0).toUpperCase() || '?');

    const tuoi = esc(h.tuoi) || (h.namSinh ? String(new Date().getFullYear() - parseInt(h.namSinh)) : '');
    const meta = [tuoi && tuoi + ' tuổi', esc(h.gioiTinh)].filter(Boolean).join(' · ');

    const phong = esc(h.soPhong || h.roomNumber);
    const giuong = esc(h.soGiuong || h.bedNumber);
    const noiNam = [phong && 'P.' + phong, giuong && 'G.' + giuong].filter(Boolean).join(' · ');

    const lyDo = esc(rec.lyDoVaoVien);
    const chanDoan = esc(rec.chanDoanXacDinh || rec.chanDoanSoBo);
    const track = (rec.theoDoi || []).length;
    const admit = (() => {
        const m = String(h.ngayVaoVien || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}` : '';
    })();
    // Bệnh án nằm ngoài thư mục thì phải tự nói rõ ở bệnh viện nào
    const inFolder = !!rec.thuMuc?.id;
    const benhVien = esc(h.benhVien);

    return `
        <article draggable="true" class="rec-card group${selected.has(String(rec.id)) ? ' selected' : ''}" data-id="${id}"
            style="--sex:${sexGrad};--sex-ink:${sexInk};--kind-soft:${kindSoft};--kind-ink:${kindInk}">
            <span class="rc-check"><i class="fas fa-check"></i></span>
            <div class="rc-body card-open">
                <div class="rc-top">
                    <div class="rc-avatar">${initial}</div>
                    <div class="rc-id">
                        <p class="rc-name" title="${hoTen}">${hoTen}</p>
                        <p class="rc-meta"><i class="fas fa-${sexIcon}"></i>${meta || '—'}</p>
                    </div>
                    <span class="rc-state ${isDone(rec) ? 'done' : 'draft'}">
                        <i class="fas fa-${isDone(rec) ? 'circle-check' : 'pen'}"></i>${isDone(rec) ? 'Hoàn thành' : 'Đang viết'}</span>
                </div>

                <div class="rc-chips">
                    <span class="rc-chip kind"><i class="fas fa-stethoscope"></i>${esc(kindName)}</span>
                    ${inFolder
            ? `<span class="rc-chip folder"><i class="fas fa-folder"></i>${esc(rec.thuMuc.ten)}</span>`
            : (benhVien ? `<span class="rc-chip hosp"><i class="fas fa-hospital"></i>${benhVien}</span>` : '')}
                    ${noiNam ? `<span class="rc-chip"><i class="fas fa-bed"></i>${noiNam}</span>` : ''}
                    ${admit ? `<span class="rc-chip"><i class="fas fa-right-to-bracket"></i>Vào viện ${admit}</span>` : ''}
                </div>

                <div class="rc-lines">
                    <p class="rc-line ${lyDo ? '' : 'empty'}" title="${lyDo}">
                        <span class="lbl ldvv">Lý do</span>${lyDo || 'Chưa ghi lý do vào viện'}</p>
                    <p class="rc-line ${chanDoan ? '' : 'empty'}" title="${chanDoan}">
                        <span class="lbl cd">Chẩn đoán</span>${chanDoan || 'Chưa có chẩn đoán'}</p>
                </div>

                <div class="rc-foot">
                    ${ringHtml(completeness(rec))}
                    ${track ? `<span class="rc-track-count"><i class="fas fa-clipboard-list mr-1"></i>${track} lần theo dõi</span>` : ''}
                    <span class="rc-time"><i class="far fa-clock mr-1"></i>${timeAgo(rec.lastUpdated)}</span>
                </div>
            </div>

            <div class="rc-actions">
                <button class="rc-btn view view-record" data-id="${id}"><i class="fas fa-eye"></i>Xem</button>
                <button class="rc-btn edit edit-record" data-id="${id}"><i class="fas fa-pen"></i>Sửa</button>
                <button class="rc-btn track track-record" data-id="${id}"><i class="fas fa-clipboard-list"></i>Theo dõi</button>
                <button class="rc-btn more menu-record" data-id="${id}" title="Thêm"><i class="fas fa-ellipsis-v"></i></button>
            </div>
            <div class="rc-menu">
                <button class="move-record" data-id="${id}"><i class="fas fa-folder-tree"></i>Chuyển thư mục</button>
                <button class="dup-record" data-id="${id}"><i class="fas fa-copy"></i>Nhân bản</button>
                <button class="delete-record danger" data-id="${id}"><i class="fas fa-trash"></i>Xóa bệnh án</button>
            </div>
        </article>`;
}

function render() {
    renderStats();
    const box = document.getElementById('medical-record-cards');
    const list = visibleRecords();
    for (const id of [...selected]) if (!records.some(r => String(r.id) === id)) selected.delete(id);
    box.innerHTML = list.length ? list.map(cardHtml).join('') : emptyState();
    box.classList.toggle('select-mode', selectMode);
    renderBulkBar();
    renderFolders();
    document.getElementById('empty-create')?.addEventListener('click', createNew);
}

/* ================= Thư mục đợt thực hành ================= */
function countIn(id) {
    return records.filter(r => String(r.thuMuc?.id || '') === String(id)).length;
}

function renderFolders() {
    const box = document.getElementById('folder-chips');
    if (!box) return;
    const folders = mergeFolders(records);
    const loose = records.filter(r => !r.thuMuc?.id).length;
    const chip = (id, label, count) =>
        `<button class="folder-chip${String(folderId) === String(id) ? ' active' : ''}" data-folder="${esc(id)}">
            <i class="fas fa-${id ? 'folder' : 'layer-group'}"></i>${esc(label)}
            <span class="fc-count">${count}</span></button>`;

    box.innerHTML = chip('', 'Tất cả', records.length)
        + folders.map(f => chip(f.id, f.ten || 'Thư mục', countIn(f.id))).join('')
        + (loose && folders.length ? chip('__none__', 'Chưa xếp', loose) : '');

    const info = document.getElementById('folder-info');
    const cur = folderId && folderId !== '__none__' ? getFolder(folderId) : null;
    if (info) {
        info.classList.toggle('hidden', !cur);
        if (cur) {
            info.innerHTML = `<i class="fas fa-circle-info text-pink-400"></i>
                <b class="text-gray-700">${esc(cur.ten || 'Thư mục')}</b>
                <span>${esc(folderMeta(cur)) || 'Chưa điền khoa / bệnh viện'}</span>
                <button id="folder-edit" class="ml-auto text-pink-600 font-semibold hover:underline"><i class="fas fa-pen mr-1"></i>Sửa thư mục</button>`;
        }
    }
}

let editingFolder = null;
function openFolderModal(f) {
    editingFolder = f || null;
    const $ = (id) => document.getElementById(id);
    $('folder-modal-title').textContent = f ? 'Sửa thư mục đợt thực hành' : 'Thư mục đợt thực hành mới';
    $('folder-name').value = f?.ten || '';
    $('folder-dept').value = f?.khoa || '';
    $('folder-hospital').value = f?.benhVien || '';
    $('folder-from').value = f?.tuNgay || '';
    $('folder-to').value = f?.denNgay || '';
    $('folder-delete').classList.toggle('hidden', !f);
    $('folder-modal').classList.remove('hidden');
    $('folder-name').focus();
}
const closeFolderModal = () => document.getElementById('folder-modal')?.classList.add('hidden');

function setupFolders() {
    document.getElementById('folder-new')?.addEventListener('click', () => openFolderModal(null));

    document.getElementById('folder-chips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-folder]');
        if (!chip) return;
        folderId = chip.dataset.folder;
        renderFolders();
        render();
    });

    document.getElementById('folder-info')?.addEventListener('click', (e) => {
        if (e.target.closest('#folder-edit')) openFolderModal(getFolder(folderId));
    });

    document.getElementById('folder-modal')?.addEventListener('click', (e) => {
        if (e.target.closest('[data-folder-close]')) closeFolderModal();
    });

    document.getElementById('folder-save')?.addEventListener('click', async () => {
        const $ = (id) => document.getElementById(id);
        const ten = $('folder-name').value.trim();
        if (!ten) return showToast('Nhập tên đợt thực hành trước.', 'warning');
        const f = {
            id: editingFolder?.id || newFolderId(), ten,
            khoa: $('folder-dept').value.trim(),
            benhVien: $('folder-hospital').value.trim(),
            tuNgay: $('folder-from').value,
            denNgay: $('folder-to').value
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
        await reload();
        showToast(editingFolder ? 'Đã cập nhật thư mục.' : 'Đã tạo thư mục — bệnh án tạo trong đây sẽ tự điền khoa và bệnh viện.', 'success');
    });

    document.getElementById('folder-delete')?.addEventListener('click', async () => {
        if (!editingFolder) return;
        const n = countIn(editingFolder.id);
        if (n && !confirm(`Thư mục này còn ${n} bệnh án. Xóa thư mục thì bệnh án vẫn còn nhưng không thuộc đợt nào. Tiếp tục?`)) return;
        for (const r of records.filter(x => String(x.thuMuc?.id) === String(editingFolder.id))) {
            delete r.thuMuc;
            await saveRecord(r);
        }
        deleteFolder(editingFolder.id);
        closeFolderModal();
        folderId = '';
        await reload();
        showToast('Đã xóa thư mục.', 'success');
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
    undoToast(f ? `Đã chuyển ${what}vào "${f.ten}".` : `Đã bỏ ${what}khỏi thư mục.`, async () => {
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
    const folders = mergeFolders(records);
    document.getElementById('move-subject').textContent = ids.length > 1
        ? `${ids.length} bệnh án đã chọn`
        : (rec?.hanhChinh?.hoTen || 'Bệnh án chưa đặt tên')
        + (rec?.thuMuc?.ten ? ` · đang ở "${rec.thuMuc.ten}"` : ' · chưa xếp thư mục');
    const cur = ids.length > 1 ? '__nhieu__' : String(rec?.thuMuc?.id || '');
    document.getElementById('move-list').innerHTML =
        folders.map(f => `<button class="move-opt${cur === String(f.id) ? ' is-current' : ''}" data-move="${esc(f.id)}">
            <i class="fas fa-folder"></i><span><b>${esc(f.ten || 'Thư mục')}</b><small>${esc(folderMeta(f)) || 'Chưa điền khoa / bệnh viện'}</small></span></button>`).join('')
        + `<button class="move-opt${cur ? '' : ' is-current'}" data-move="">
            <i class="fas fa-inbox"></i><span><b>Không thuộc thư mục nào</b><small>Để riêng, không thuộc đợt thực hành</small></span></button>`;
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

    const chips = document.getElementById('folder-chips');
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
    const show = selectMode && selected.size > 0;
    bar.classList.toggle('hidden', !show);
    bar.style.display = show ? 'flex' : 'none';
    document.getElementById('bulk-count').textContent = `${selected.size} đã chọn`;
    const st = document.getElementById('select-toggle');
    if (st) {
        st.style.background = selectMode ? '#ec4899' : '';
        st.style.color = selectMode ? '#fff' : '';
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
    document.getElementById('select-toggle')?.addEventListener('click', () => setSelectMode(!selectMode));
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
    const q = folderId && folderId !== '__none__' ? '&folder=' + encodeURIComponent(folderId) : '';
    location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent('BA-' + Date.now()) + q;
}

function updateSyncStatus() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.innerHTML = isSignedIn()
        ? `<i class="fas fa-cloud text-green-400"></i> Đã đồng bộ đám mây · ${records.length} bệnh án`
        : `<i class="fas fa-hdd text-amber-400"></i> Chỉ lưu trên máy này · <a href="../../index.html" class="text-pink-500 underline font-medium">đăng nhập để đồng bộ</a>`;
}

async function reload({ cloud = false } = {}) {
    records = sortRecords(listLocal());
    render();
    if (cloud) {
        const el = document.getElementById('sync-status');
        if (el) el.innerHTML = `<i class="fas fa-circle-notch fa-spin text-pink-400"></i> Đang đồng bộ…`;
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
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        icon.className = 'fas fa-circle-notch fa-spin';
        const r = await syncNow({ wait: true });
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
        } else if (!r.pulled && !r.pushed) {
            showToast('Hai bên đã giống nhau, không có bệnh án nào phải đồng bộ.', 'info');
        } else {
            showToast(`Đã đồng bộ: tải về ${r.pulled} bệnh án, đẩy lên ${r.pushed} bệnh án.`, 'success', 6000);
        }
    });
}

function setupActions() {
    setupSyncButton();
    document.getElementById('create-new-record')?.addEventListener('click', createNew);

    document.getElementById('search-record')?.addEventListener('input', (e) => {
        keyword = e.target.value.trim().toLowerCase();
        render();
    });

    document.getElementById('sort-record')?.addEventListener('change', (e) => {
        sortMode = e.target.value;
        render();
    });

    document.getElementById('filter-chips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filter = chip.dataset.filter;
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
            const card = e.target.closest('.card-open');
            if (card) location.href = '../medical-record/xem-benh-an.html?id=' + encodeURIComponent(card.closest('article').dataset.id);
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
        } else if (btn.classList.contains('edit-record')) {
            location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent(id);
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

/* ================= Khởi động ================= */
setupChrome();
setupActions();
setupFolders();
setupMove();
setupBulk();
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-record')) {
        document.querySelectorAll('.rec-card.menu-open').forEach(c => c.classList.remove('menu-open'));
    }
});

// Lắng nghe phiên đăng nhập: tự động cập nhật avatar, tên người dùng và đồng bộ đám mây
onSessionUser(async (user) => {
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
        const menu = document.getElementById('user-menu-button');
        if (menu) menu.onclick = null;
        const mob = document.getElementById('user-avatar-mobile');
        if (mob) mob.onclick = null;
    }
    await reload({ cloud: !!user });
});
