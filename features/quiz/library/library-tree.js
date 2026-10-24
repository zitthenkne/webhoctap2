// File: features/quiz/library/library-tree.js
// CÂY THƯ MỤC bên cạnh thư viện: thấy toàn bộ thư mục lồng nhau một lượt, bấm là nhảy thẳng tới cấp bất kỳ,
// thả bộ đề / thư mục vào một nút là chuyển vào đó. Cùng với điều hướng bằng nút Back (mục lịch sử theo thư mục)
// và phím tắt lên cấp.
//
// - Điện thoại / iPad: ngăn kéo trượt từ phải, có nền mờ; chọn xong thư mục là tự đóng.
// - Màn ≥1280px: ghim cạnh phải nội dung (không che), nhớ trạng thái mở theo thiết bị.
// - Chỉ đọc S.userFolders / S.userQuizSets đã có trong RAM → mở cây không tốn lượt đọc Firestore nào.
// - Vẽ lại khi renderLibrary phát sự kiện 'library:render' (không import ngược library-render.js → khỏi vòng phụ thuộc
//   lúc nạp; ở đây import nó là một chiều).

import { S } from './library-state.js';
import { childFolders, folderPath, folderHex, quizFolderOf, escapeHtml } from './library-helpers.js';
import { goToFolder, bindMoveDropZone } from './library-render.js';
import { openFolderModal } from './library-actions.js';

const OPEN_KEY = 'folderTreeOpen';
const EXPANDED_KEY = 'folderTreeExpanded';
const DOCK_MQ = window.matchMedia('(min-width: 1280px)');

let root = null;          // <aside> ngăn kéo
let backdrop = null;
let listEl = null;
let searchEl = null;
let term = '';
let expanded = loadExpanded();

function loadExpanded() {
    try {
        const arr = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]');
        return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
}
function saveExpanded() {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])); } catch {}
}
function isOpen() { return !!root && root.classList.contains('is-open'); }
function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

function build() {
    const host = document.getElementById('libraryContent');
    if (!host || root) return;
    // Nằm TRONG #libraryContent: rời tab Thư viện là cây ẩn theo, không phải tự dọn
    backdrop = document.createElement('div');
    backdrop.className = 'ft-backdrop';
    backdrop.addEventListener('click', () => setOpen(false));

    root = document.createElement('aside');
    root.className = 'ft-drawer';
    root.setAttribute('aria-label', 'Cây thư mục');
    root.innerHTML = `
        <div class="ft-head">
            <h3><i class="fas fa-sitemap"></i> Cây thư mục</h3>
            <button type="button" class="ft-icon-btn" data-act="expand" title="Mở hết các nhánh"><i class="fas fa-angles-down"></i></button>
            <button type="button" class="ft-icon-btn" data-act="collapse" title="Thu gọn hết"><i class="fas fa-angles-up"></i></button>
            <button type="button" class="ft-icon-btn" data-act="close" title="Đóng (Esc)" aria-label="Đóng cây thư mục"><i class="fas fa-times"></i></button>
        </div>
        <div class="ft-search">
            <i class="fas fa-search"></i>
            <input type="search" placeholder="Lọc thư mục..." autocomplete="off" aria-label="Lọc cây thư mục">
        </div>
        <div class="ft-list" role="tree"></div>
        <button type="button" class="ft-new" data-act="new"><i class="fas fa-folder-plus"></i> <span>Thư mục mới tại đây</span></button>`;
    host.appendChild(backdrop);
    host.appendChild(root);
    listEl = root.querySelector('.ft-list');
    searchEl = root.querySelector('.ft-search input');

    root.querySelector('[data-act="close"]').addEventListener('click', () => setOpen(false));
    root.querySelector('[data-act="expand"]').addEventListener('click', () => {
        S.userFolders.forEach(f => { if (childFolders(f.id).length) expanded.add(f.id); });
        saveExpanded();
        render();
    });
    root.querySelector('[data-act="collapse"]').addEventListener('click', () => {
        expanded.clear();
        saveExpanded();
        render();
    });
    root.querySelector('[data-act="new"]').addEventListener('click', () => openFolderModal('create', null, '', S.currentFolderId));
    searchEl.addEventListener('input', () => { term = searchEl.value.trim(); render(); });
    listEl.addEventListener('keydown', onTreeKey);
}

/** Số bộ đề trực tiếp theo thư mục (một lượt qua S.userQuizSets), rồi gộp cây con khi vẽ. */
function countDirect() {
    const m = new Map();
    for (const q of S.userQuizSets) {
        const fid = quizFolderOf(q);
        m.set(fid, (m.get(fid) || 0) + 1);
    }
    return m;
}

function render() {
    if (!root || !isOpen()) return;
    const direct = countDirect();
    const totals = new Map();
    const total = (id, seen = new Set()) => {
        if (totals.has(id)) return totals.get(id);
        if (seen.has(id)) return 0;
        seen.add(id);
        let n = direct.get(id) || 0;
        for (const c of childFolders(id)) n += total(c.id, seen);
        totals.set(id, n);
        return n;
    };

    // Đang lọc: giữ thư mục khớp + mọi tổ tiên của nó (để thấy nó nằm ở đâu), các nhánh đó tự mở
    let keep = null;
    if (term) {
        const t = normalize(term);
        keep = new Set();
        for (const f of S.userFolders) {
            if (normalize(f.name).includes(t)) folderPath(f.id).forEach(p => keep.add(p.id));
        }
    }
    const onPath = new Set(folderPath(S.currentFolderId).map(f => f.id));

    const rows = [];
    const walk = (parentId, depth, seen) => {
        for (const f of childFolders(parentId)) {
            if (seen.has(f.id)) continue;
            if (keep && !keep.has(f.id)) continue;
            const kids = childFolders(f.id).filter(c => !keep || keep.has(c.id));
            // Nhánh chứa thư mục đang mở luôn bung ra — vào thẳng thư mục sâu (từ breadcrumb/tìm kiếm) vẫn thấy vị trí
            const open = kids.length > 0 && (keep ? true : expanded.has(f.id) || (onPath.has(f.id) && f.id !== S.currentFolderId));
            const isCurrent = f.id === S.currentFolderId;
            const n = total(f.id);
            const name = escapeHtml(f.name || 'Thư mục');
            rows.push(`<div class="ft-row${isCurrent ? ' is-current' : ''}${onPath.has(f.id) && !isCurrent ? ' is-trail' : ''}" role="treeitem" tabindex="-1"
                    aria-level="${depth + 1}" ${kids.length ? `aria-expanded="${open}"` : ''} ${isCurrent ? 'aria-current="true"' : ''}
                    data-id="${f.id}" style="--depth:${depth};--fc:${folderHex(f)}">
                <button type="button" class="ft-caret" tabindex="-1" ${kids.length ? '' : 'disabled aria-hidden="true"'} aria-label="${open ? 'Thu gọn' : 'Mở'} ${name}"><i class="fas fa-chevron-right"></i></button>
                <i class="fas ${escapeHtml(f.icon || 'fa-folder')} ft-ico"></i>
                <span class="ft-name" title="${name}">${name}</span>
                ${n ? `<span class="ft-count">${n}</span>` : ''}
            </div>`);
            if (open) {
                seen.add(f.id);
                walk(f.id, depth + 1, seen);
            }
        }
    };
    walk(null, 0, new Set());

    const rootCount = direct.get(null) || 0;
    listEl.innerHTML = `
        <div class="ft-row is-root${S.currentFolderId === null ? ' is-current' : ''}" role="treeitem" tabindex="-1" aria-level="1" data-id="" style="--depth:0">
            <span class="ft-caret" aria-hidden="true"></span>
            <i class="fas fa-home ft-ico"></i>
            <span class="ft-name">Thư viện gốc</span>
            ${rootCount ? `<span class="ft-count">${rootCount}</span>` : ''}
        </div>
        ${rows.join('')}
        ${!S.userFolders.length ? '<p class="ft-empty">Chưa có thư mục nào.<br>Bấm "Thư mục mới" bên dưới để bắt đầu sắp xếp.</p>'
            : term && !rows.length ? `<p class="ft-empty">Không có thư mục khớp "${escapeHtml(term)}"</p>` : ''}`;

    listEl.querySelectorAll('.ft-row').forEach(row => {
        const id = row.dataset.id || null;
        row.addEventListener('click', (e) => {
            if (e.target.closest('.ft-caret')) { toggleBranch(id); return; }
            openFolder(id);
        });
        bindMoveDropZone(row, id);
    });
    const label = root.querySelector('.ft-new span');
    if (label) label.textContent = S.currentFolderId ? 'Thư mục con tại đây' : 'Thư mục mới ở gốc';

    // Thư mục đang mở luôn nằm trong tầm nhìn của cây
    const cur = listEl.querySelector('.ft-row.is-current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function toggleBranch(id, force) {
    if (!id) return;
    const willOpen = force !== undefined ? force : !expanded.has(id);
    if (willOpen) expanded.add(id); else expanded.delete(id);
    saveExpanded();
    render();
    const row = listEl.querySelector(`.ft-row[data-id="${CSS.escape(id)}"]`);
    if (row) row.focus({ preventScroll: true });
}

function openFolder(id) {
    if (id !== S.currentFolderId) goToFolder(id);
    if (!DOCK_MQ.matches) setOpen(false); // điện thoại: chọn xong thì trả lại màn hình cho danh sách
}

// Bàn phím kiểu cây chuẩn: ↑↓ di chuyển, → mở / xuống con, ← thu / lên cha, Enter mở thư mục
function onTreeKey(e) {
    const rows = [...listEl.querySelectorAll('.ft-row')];
    const row = e.target.closest('.ft-row');
    if (!row) return;
    const i = rows.indexOf(row);
    const id = row.dataset.id || null;
    const focus = (r) => { if (r) { e.preventDefault(); r.focus(); } };
    switch (e.key) {
        case 'ArrowDown': focus(rows[i + 1]); break;
        case 'ArrowUp': focus(rows[i - 1]); break;
        case 'ArrowRight':
            if (row.getAttribute('aria-expanded') === 'false') { e.preventDefault(); toggleBranch(id, true); }
            else if (row.getAttribute('aria-expanded') === 'true') focus(rows[i + 1]);
            break;
        case 'ArrowLeft': {
            if (row.getAttribute('aria-expanded') === 'true') { e.preventDefault(); toggleBranch(id, false); break; }
            const level = Number(row.getAttribute('aria-level'));
            focus(rows.slice(0, i).reverse().find(r => Number(r.getAttribute('aria-level')) < level));
            break;
        }
        case 'Enter':
        case ' ':
            e.preventDefault();
            openFolder(id);
            break;
        case 'Escape':
            e.preventDefault();
            setOpen(false);
            break;
    }
}

function applyDock() {
    const host = document.getElementById('libraryContent');
    const docked = DOCK_MQ.matches && isOpen();
    if (host) host.classList.toggle('has-folder-tree', docked);
    // Ghim cạnh phải thì bắt đầu NGAY DƯỚI thanh tiêu đề dính (nếu không sẽ che tên + avatar người dùng)
    if (root) {
        const header = document.querySelector('body header.sticky');
        const bottom = docked && header && header.offsetParent !== null ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        root.style.setProperty('--ft-top', `${Math.round(bottom)}px`);
    }
    if (backdrop) backdrop.classList.toggle('is-on', isOpen() && !DOCK_MQ.matches);
}

export function setOpen(open) {
    build();
    if (!root) return;
    root.classList.toggle('is-open', open);
    const btn = document.getElementById('folder-tree-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    // Chỉ màn rộng mới nhớ "để mở" — trên điện thoại cây là ngăn kéo tạm thời
    if (DOCK_MQ.matches) { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch {} }
    applyDock();
    if (open) {
        render();
        if (!DOCK_MQ.matches) {
            const cur = listEl.querySelector('.ft-row.is-current') || listEl.querySelector('.ft-row');
            if (cur) cur.focus({ preventScroll: true });
        }
    }
}
export function toggleFolderTree() { setOpen(!isOpen()); }

// === ĐIỀU HƯỚNG BẰNG LỊCH SỬ & PHÍM TẮT ===
function libraryVisible() {
    const p = document.getElementById('libraryContent');
    return !!p && !p.classList.contains('hidden');
}

// Back / Forward giữa các thư mục (mục lịch sử do setCurrentFolder đẩy vào). app.js lo việc đổi TAB; ở đây chỉ
// xử lý khi vẫn đứng ở tab Thư viện.
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.quizLaunch) return;
    if (location.hash !== '#libraryContent') return;
    const target = e.state && typeof e.state.libFolder === 'string' && e.state.libFolder ? e.state.libFolder : null;
    if (target === S.currentFolderId) return;
    goToFolder(target, { fromHistory: true });
});

// Backspace hoặc Alt+↑ (ngoài ô nhập liệu) = lên một cấp, như trình quản lý tệp
document.addEventListener('keydown', (e) => {
    if (!libraryVisible() || S.currentFolderId === null) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (document.querySelector('.fixed.inset-0:not(.hidden)')) return; // đang mở hộp thoại
    const up = (e.key === 'Backspace' && !e.altKey && !e.ctrlKey && !e.metaKey) || (e.altKey && e.key === 'ArrowUp');
    if (!up) return;
    e.preventDefault();
    const path = folderPath(S.currentFolderId);
    goToFolder(path.length > 1 ? path[path.length - 2].id : null);
});

document.addEventListener('library:render', render);
DOCK_MQ.addEventListener('change', applyDock);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !DOCK_MQ.matches) setOpen(false);
});

/** Gắn nút mở cây + khôi phục trạng thái ghim trên màn rộng. Gọi một lần lúc khởi tạo. */
export function initFolderTree() {
    const btn = document.getElementById('folder-tree-btn');
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFolderTree(); });
    let wasOpen = false;
    try { wasOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch {}
    if (wasOpen && DOCK_MQ.matches) setOpen(true);
}
