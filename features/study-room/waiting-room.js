// waiting-room.js — Trang chờ: danh sách bệnh án
import { showToast } from '../../core/utils.js';
import {
    listLocal, sortRecords, syncFromCloud, deleteRecord, saveRecord,
    isSignedIn, exportJson, importJson
} from '../medical-record/record-store.js';

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

/* ================= Tính % hoàn thiện ================= */
const SKIP_KEYS = new Set(['id', 'lastUpdated', 'status', '_synced']);
function completeness(rec) {
    let total = 0, filled = 0;
    (function walk(o) {
        for (const [k, v] of Object.entries(o || {})) {
            if (SKIP_KEYS.has(k)) continue;
            if (v && typeof v === 'object') walk(v);
            else { total++; if (String(v ?? '').trim()) filled++; }
        }
    })(rec);
    return total ? Math.round(filled / total * 100) : 0;
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

const isDone = (r) => (r.status || 'Hoàn thành') === 'Hoàn thành';

function visibleRecords() {
    let out = records.filter(r => {
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

function cardHtml(rec) {
    const pct = completeness(rec);
    const tone = pct >= 80 ? 'green' : pct >= 40 ? 'amber' : 'pink';
    const pctText = tone === 'green' ? 'text-green-500' : tone === 'amber' ? 'text-amber-500' : 'text-pink-400';
    const pctBar = tone === 'green' ? 'bg-green-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-pink-400';
    const badge = isDone(rec)
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-600 border border-green-200 flex-shrink-0"><i class="fas fa-check-circle text-[10px]"></i>Hoàn thành</span>`
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0"><i class="fas fa-pen text-[10px]"></i>Đang viết</span>`;
    const hoTen = esc(rec.hanhChinh?.hoTen) || 'Chưa đặt tên';
    const meta = [esc(rec.hanhChinh?.tuoi) && esc(rec.hanhChinh?.tuoi) + ' tuổi', esc(rec.hanhChinh?.gioiTinh)].filter(Boolean).join(' · ');
    const chanDoan = esc(rec.chanDoanXacDinh || rec.chanDoanSoBo || rec.lyDoVaoVien);
    const phong = esc(rec.hanhChinh?.soPhong || rec.hanhChinh?.roomNumber);
    const giuong = esc(rec.hanhChinh?.soGiuong || rec.hanhChinh?.bedNumber);
    const initial = esc((rec.hanhChinh?.hoTen || '?').trim().charAt(0).toUpperCase() || '?');
    const id = esc(rec.id);
    return `
        <article class="rec-card group bg-white border border-pink-100 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-pink-300 transition-all duration-200 flex flex-col overflow-hidden" data-id="${id}">
            <div class="p-4 flex flex-col gap-3 flex-1 cursor-pointer card-open">
                <div class="flex items-start gap-3">
                    <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-400 to-purple-400 text-white font-bold text-lg flex items-center justify-center flex-shrink-0 shadow">${initial}</div>
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-gray-800 truncate leading-tight" title="${hoTen}">${hoTen}</p>
                        <p class="text-xs text-gray-400 truncate">${meta || '—'}</p>
                    </div>
                    ${badge}
                </div>
                <p class="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]" title="${chanDoan}">${chanDoan || '<span class="text-gray-300">Chưa có chẩn đoán</span>'}</p>
                <div class="mt-auto">
                    <div class="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                        <span>Hoàn thiện</span><span class="font-semibold ${pctText}">${pct}%</span>
                    </div>
                    <div class="h-1.5 bg-pink-50 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500 ${pctBar}" style="width:${pct}%"></div>
                    </div>
                </div>
                <div class="flex items-center gap-3 text-gray-400 text-[11px] flex-wrap">
                    ${phong ? `<span><i class="fas fa-door-open mr-1"></i>P.${phong}</span>` : ''}
                    ${giuong ? `<span><i class="fas fa-bed mr-1"></i>G.${giuong}</span>` : ''}
                    <span class="ml-auto"><i class="far fa-clock mr-1"></i>${timeAgo(rec.lastUpdated)}</span>
                </div>
            </div>
            <div class="flex border-t border-pink-50 divide-x divide-pink-50">
                <button class="view-record flex-1 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 active:scale-95 transition" data-id="${id}"><i class="fas fa-eye mr-1"></i>Xem</button>
                <button class="edit-record flex-1 py-2.5 text-sm font-medium text-pink-600 hover:bg-pink-50 active:scale-95 transition" data-id="${id}"><i class="fas fa-pen mr-1"></i>Sửa</button>
                <button class="dup-record px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600 active:scale-95 transition" data-id="${id}" title="Nhân bản"><i class="fas fa-copy"></i></button>
                <button class="delete-record px-4 py-2.5 text-sm text-red-400 hover:bg-red-50 hover:text-red-600 active:scale-95 transition" data-id="${id}" title="Xóa"><i class="fas fa-trash"></i></button>
            </div>
        </article>`;
}

function render() {
    renderStats();
    const box = document.getElementById('medical-record-cards');
    const list = visibleRecords();
    box.innerHTML = list.length ? list.map(cardHtml).join('') : emptyState();
    document.getElementById('empty-create')?.addEventListener('click', createNew);
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
    location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent('BA-' + Date.now());
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
        records = await syncFromCloud();
        render();
    }
    updateSyncStatus();
}

function setupActions() {
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
        const btn = e.target.closest('button[data-id]');
        if (!btn) {
            const card = e.target.closest('.card-open');
            if (card) location.href = '../medical-record/xem-benh-an.html?id=' + encodeURIComponent(card.closest('article').dataset.id);
            return;
        }
        const id = btn.dataset.id;

        if (btn.classList.contains('view-record')) {
            location.href = '../medical-record/xem-benh-an.html?id=' + encodeURIComponent(id);
        } else if (btn.classList.contains('edit-record')) {
            location.href = '../medical-record/tao-benh-an.html?id=' + encodeURIComponent(id);
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
reload({ cloud: true });
