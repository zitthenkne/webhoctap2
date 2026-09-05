/* =====================================================================
   TIỆN ÍCH THÊM CHO TRANG VIẾT BỆNH ÁN — bản pastel 2026-09-04

   Vì sao tách file: tao-benh-an.js đã 3500 dòng và giữ toàn bộ mạch nhập
   liệu / tự lưu. File này KHÔNG đụng vào mạch đó — chỉ đọc DOM có sẵn và
   thêm mấy lối tắt (tìm mục, nhảy ô trống, tập trung, riêng tư, cỡ chữ).
   Nạp SAU tao-benh-an.js nên mọi nút của trang đã gắn xong sự kiện.
   ===================================================================== */
import { showToast } from '../../core/utils.js';

const $ = id => document.getElementById(id);
const form = $('medical-record-form');
const tabLinks = [...document.querySelectorAll('.tab-link')];
const body = document.body;

/* Bỏ dấu tiếng Việt để gõ "tien can" cũng tìm ra "Tiền căn" */
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().trim();

/* ------------------------------------------------------------------ */
/* 1. VÒNG TRÒN % HOÀN THIỆN                                           */
/* Không sửa updateProgress() của file chính — chỉ rình chữ "42%" nó    */
/* ghi vào #overall-pct rồi vẽ lại vòng tròn theo con số đó.            */
/* ------------------------------------------------------------------ */
const ring = $('ba-ring');
const pctLabel = $('overall-pct');
let ranConfetti = false;

function syncRing() {
    const n = parseInt(pctLabel?.textContent) || 0;
    ring?.style.setProperty('--p', n / 100);
    ring?.classList.toggle('is-done', n >= 100);
    if (n >= 100 && !ranConfetti) { ranConfetti = true; boom(); }
    if (n < 100) ranConfetti = false;
}
if (pctLabel) {
    new MutationObserver(syncRing).observe(pctLabel, { childList: true, characterData: true, subtree: true });
    syncRing();
}

/* Mưa trái tim khi bệnh án đủ 100% — phần thưởng nhỏ cho công gõ */
function boom() {
    const host = document.createElement('div');
    host.className = 'ba-boom';
    host.innerHTML = Array.from({ length: 14 }, (_, i) =>
        `<i style="--x:${(Math.random() * 200 - 100).toFixed(0)}px;--d:${(Math.random() * .4).toFixed(2)}s">${'💗🌸✨🎀'[i % 4]}</i>`).join('');
    ring?.appendChild(host);
    setTimeout(() => host.remove(), 1800);
    showToast('Bệnh án đã đủ mục — đọc lại một lượt rồi bấm Lưu nhé!', 'success');
}

/* ------------------------------------------------------------------ */
/* 2. NHẢY TỚI MỘT Ô BẤT KỲ                                            */
/* ------------------------------------------------------------------ */
function flash(el) {
    el.classList.remove('ba-flash');
    void el.offsetWidth;
    el.classList.add('ba-flash');
    setTimeout(() => el.classList.remove('ba-flash'), 1600);
}

/* Mở hết lớp vỏ đang gấp quanh một ô rồi cuộn tới, không thì cuộn vào chỗ trống.
   Xuất ra cho nhap-lien-ket.js dùng chung — cả hai file đều cần "nhảy tới ô". */
export function goTo(el) {
    if (!el) return;
    const pane = el.closest('.tab-content');
    if (pane && !pane.classList.contains('active')) {
        tabLinks.find(l => l.dataset.tab === pane.id)?.click();
    }
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    const folded = el.closest('fieldset')?.querySelector('legend.foldable.folded');
    folded?.click();
    // showTab() cuộn trang về đầu -> đợi nó xong mới cuộn tới ô, kẻo bị kéo ngược
    setTimeout(() => {
        const box = el.closest('label, .calc-box, fieldset') || el;
        box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(box);
        if (el.matches('input, select, textarea')) el.focus({ preventScroll: true });
    }, 260);
}

/* ------------------------------------------------------------------ */
/* 3. TÌM NHANH (Ctrl/Cmd + K)                                         */
/* Gõ tên mục hoặc tên ô -> Enter là nhảy tới. Trong biểu mẫu dài hơn   */
/* 300 ô thì đây là cách duy nhất tìm lại một ô mà không cuộn mỏi tay.  */
/* ------------------------------------------------------------------ */
const cmd = $('ba-cmd');
const cmdQ = $('cmdk-q');
const cmdList = $('cmdk-list');
let index = null, hits = [], cur = 0;

function labelText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('input, select, textarea, small, .hx-q, .lb-sub, button, .tab-progress, .fold-count').forEach(x => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim().slice(0, 70);
}

/* Tên người-đọc-được của một ô nhập: nhãn bọc ngoài, rồi <label for>, rồi mới
   tới placeholder / aria-label / id. Nhiều ô của trang này được đặt tên bằng
   div hoặc chỉ có placeholder nên phải dò đủ bốn chỗ.
   Xuất ra cho nhap-lien-ket.js gọi tên ô trong bảng dán và thanh trợ nhập. */
export function labelOf(ctl) {
    const lab = ctl.closest('label') || (ctl.id && form.querySelector(`label[for="${CSS.escape(ctl.id)}"]`));
    /* Nhiều ô ở đây có nhãn nằm NGAY TRƯỚC chứ không bọc ngoài (ô sinh hiệu,
       ô trong <details>). Không dò tới đó thì rơi xuống placeholder, ra những
       cái tên như "Nhập mạch" thay vì "Mạch (l/p)". */
    const prev = ctl.previousElementSibling;
    const near = prev?.matches?.('label, summary, .hx-sub, .calc-title') ? prev : null;
    return (lab && labelText(lab)) || (near && labelText(near))
        || ctl.placeholder || ctl.getAttribute('aria-label') || ctl.id;
}

function buildIndex() {
    const out = [];
    const seen = new Set();
    /* `val` = chữ đang có trong ô. Đưa luôn vào chuỗi dò nên gõ "38,5" hay
       "viem phoi" là nhảy được tới đúng ô đã ghi câu đó — không chỉ tìm được
       TÊN ô như trước. Trong biểu mẫu 300 ô thì đây mới là cách tìm lại một
       dữ kiện mình vừa gõ mà quên mất nó nằm ở mục nào. */
    const add = (text, el, group, icon, val = '') => {
        const key = group + '|' + text;
        if (!text || text.length < 2 || seen.has(key)) return;
        seen.add(key);
        out.push({ text, el, group, icon, val, f: fold(text + ' ' + group + ' ' + val) });
    };
    const groupOf = el => {
        const sec = el.closest('.tab-content');
        return sec && tabLinks.find(t => t.dataset.tab === sec.id)?.querySelector('.tab-text')?.textContent.trim() || 'Bệnh án';
    };
    tabLinks.forEach(l => add(labelText(l.querySelector('.tab-text')), l, 'Mục lớn', 'fa-folder-open'));
    form.querySelectorAll('legend, .calc-title, .hx-sub, .hx-newhead, .tr-label, .score-name')
        .forEach(h => add(labelText(h), h, groupOf(h), 'fa-bookmark'));
    /* Đi từ chính ô nhập chứ không từ thẻ <label>: nhiều ô của trang này được
       đặt tên bằng div (.hx-sub) hoặc chỉ có placeholder, làm theo <label> thì
       sót gần nửa biểu mẫu. */
    form.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(ctl => {
        if (ctl.closest('#ba-settings')) return;
        const v = ctl.type === 'checkbox' ? (ctl.checked ? 'đã tick' : '')
            : String(ctl.value || '').replace(/\s+/g, ' ').trim();
        add(labelOf(ctl), ctl, groupOf(ctl), v ? 'fa-pen-to-square' : 'fa-pen', v.slice(0, 90));
    });
    return out;
}

function render() {
    cmdList.innerHTML = hits.length ? hits.map((h, i) =>
        `<button type="button" class="cmdk-item${i === cur ? ' is-on' : ''}" data-i="${i}">
            <i class="fas ${h.icon}"></i><b>${h.text}</b><span>${h.group}</span>${h.val
            ? `<span class="cmdk-val">${h.val.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>` : ''}</button>`).join('')
        : `<p class="cmdk-empty">Không có mục nào khớp — thử gõ ngắn hơn (vd “tien can”, “sinh hieu”).</p>`;
    cmdList.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
}

function search() {
    const q = fold(cmdQ.value);
    hits = !q ? index.slice(0, 14)
        : index.filter(i => i.f.includes(q)).sort((a, b) => a.f.indexOf(q) - b.f.indexOf(q)).slice(0, 30);
    cur = 0;
    render();
}

function openCmd() {
    index = buildIndex();   // dựng lại mỗi lần mở: bảng thuốc / CLS / theo dõi sinh thêm ô lúc chạy
    cmd.classList.remove('hidden');
    cmdQ.value = '';
    search();
    setTimeout(() => cmdQ.focus(), 30);
}
const closeCmd = () => cmd.classList.add('hidden');

$('ba-search')?.addEventListener('click', openCmd);
$('dock-search')?.addEventListener('click', openCmd);
cmdQ?.addEventListener('input', search);
cmd?.addEventListener('click', e => {
    if (e.target.closest('[data-cmd-close]') || e.target.classList.contains('cmdk-bg')) return closeCmd();
    const it = e.target.closest('[data-i]');
    if (it) { closeCmd(); goTo(hits[+it.dataset.i]?.el); }
});
cmdQ?.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = Math.max(0, Math.min(hits.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
        render();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        closeCmd();
        goTo(hits[cur]?.el);
    } else if (e.key === 'Escape') closeCmd();
});

/* ------------------------------------------------------------------ */
/* 4. NHẢY TỚI Ô CÒN TRỐNG KẾ TIẾP                                     */
/* Bấm nhiều lần thì đi lần lượt qua từng ô chưa điền, kể cả ở mục khác */
/* ------------------------------------------------------------------ */
let gapAt = 0;
const emptyFields = () => [...form.querySelectorAll('input:not([type=hidden]), select, textarea')]
    .filter(f => !f.disabled && !f.readOnly && !f.value.trim()
        && !f.closest('#ba-settings') && !f.closest('[data-nocount]') && !f.closest('.bl-raw'));

function nextGap() {
    const list = emptyFields();
    if (!list.length) return showToast('Không còn ô trống nào — bệnh án đã kín rồi!', 'success');
    gapAt = gapAt % list.length;
    goTo(list[gapAt++]);
    showToast(`Còn ${list.length} ô trống`, 'info', 1600);
}
$('ba-gap')?.addEventListener('click', nextGap);
ring?.addEventListener('click', nextGap);

/* ------------------------------------------------------------------ */
/* 5. CỠ CHỮ + CHẾ ĐỘ RIÊNG TƯ — dùng CHUNG khoá với trang xem bệnh án */
/* (xbFs, xbPrivate) nên chỉnh ở đây thì mở bản xem cũng y như vậy.     */
/* ------------------------------------------------------------------ */
const FS = [0.88, 1, 1.14, 1.3];
let fsIdx = Math.max(0, Math.min(3, +(localStorage.getItem('xbFs') ?? 1)));
function applyFs(save) {
    document.documentElement.style.setProperty('--fs-k', FS[fsIdx]);
    $('ba-fs-val') && ($('ba-fs-val').textContent = Math.round(FS[fsIdx] * 100) + '%');
    if (save) localStorage.setItem('xbFs', fsIdx);
}
applyFs(false);
$('ba-fs')?.addEventListener('click', () => { fsIdx = (fsIdx + 1) % FS.length; applyFs(true); });

let priv = localStorage.getItem('xbPrivate') === '1';
function applyPriv(save) {
    body.classList.toggle('ba-priv', priv);
    $('ba-priv')?.classList.toggle('is-on', priv);
    if (save) localStorage.setItem('xbPrivate', priv ? '1' : '0');
}
applyPriv(false);
$('ba-priv')?.addEventListener('click', () => {
    priv = !priv;
    applyPriv(true);
    showToast(priv ? 'Đã che tên / địa chỉ / số điện thoại — bấm vào ô để xem lại.' : 'Đã hiện lại thông tin bệnh nhân.', 'info');
});

/* ------------------------------------------------------------------ */
/* 6. CHẾ ĐỘ TẬP TRUNG — mờ hết những khối không gõ, chỉ sáng khối đang */
/* làm việc. Đỡ hoa mắt khi một mục có tới chục hộp nhỏ.                */
/* ------------------------------------------------------------------ */
let zen = localStorage.getItem('baZen') === '1';
function applyZen(save) {
    body.classList.toggle('ba-zen', zen);
    $('ba-zen')?.classList.toggle('is-on', zen);
    if (save) localStorage.setItem('baZen', zen ? '1' : '0');
}
applyZen(false);
$('ba-zen')?.addEventListener('click', () => { zen = !zen; applyZen(true); });

/* ------------------------------------------------------------------ */
/* 7. THANH TIẾN ĐỘ CUỘN + PHÍM TẮT                                    */
/* ------------------------------------------------------------------ */
let raf = 0;
addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - innerHeight;
        body.style.setProperty('--sp', max > 40 ? (scrollY / max).toFixed(3) : 0);
    });
}, { passive: true });

addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openCmd(); }
    if (e.key === 'Escape' && !cmd.classList.contains('hidden')) return closeCmd();
    // Alt + 1..7: nhảy thẳng tới mục, khỏi với tay lên thanh tab
    if (e.altKey && /^[1-7]$/.test(e.key)) {
        const l = tabLinks[+e.key - 1];
        if (l) { e.preventDefault(); l.click(); }
    }
}, true);

/* Điện thoại: nút "Mục" ở thanh dưới mở đúng bảng chọn mục có sẵn */
$('dock-nav')?.addEventListener('click', () => $('sec-picker')?.click());

/* Khay công cụ của điện thoại: nút ⋯ ở thanh dưới bật hàng .ba-tools lên
   (trên máy tính hàng đó luôn hiện sẵn nên nút này ẩn). Bấm một công cụ hay
   chạm ra ngoài là khay tự đóng. */
const toolsOpen = on => body.classList.toggle('ba-tools-open', on);
$('dock-more')?.addEventListener('click', e => {
    e.stopPropagation();
    toolsOpen(!body.classList.contains('ba-tools-open'));
});
$('ba-tools')?.addEventListener('click', () => toolsOpen(false));
addEventListener('click', e => {
    if (!e.target.closest('#ba-tools, #dock-more')) toolsOpen(false);
});

/* Rung nhẹ mỗi lần đổi mục — phản hồi cho ngón tay khi vuốt ngang */
tabLinks.forEach(l => l.addEventListener('click', () => navigator.vibrate?.(8)));

/* ------------------------------------------------------------------ */
/* 8. MỤC LỤC NỔI (máy tính)                                           */
/* Một mục như "Khám lâm sàng" dài hơn hai màn hình: cuộn tới đâu cũng  */
/* không biết mình đang ở đoạn nào và còn khối nào chưa đụng tới. Dải   */
/* này liệt kê các khối của ĐÚNG mục đang mở, chấm màu cho biết khối đó */
/* đã điền hết / điền dở / còn trống, và tự sáng theo chỗ đang cuộn.    */
/* Neo ra NGOÀI thẻ nội dung, ẩn khi bật Tập trung (luật ở CSS).        */
/* ------------------------------------------------------------------ */
const rail = document.createElement('nav');
rail.className = 'ol-rail';
rail.id = 'ol-rail';
rail.setAttribute('aria-label', 'Mục lục trong mục đang mở');
document.body.appendChild(rail);

let railItems = [];

/** Khối chứa một tiêu đề — để đếm ô đã điền bên trong nó */
function boxOf(h) {
    if (h.tagName === 'LEGEND') return h.parentElement;                 // <fieldset>
    if (h.tagName === 'SUMMARY') return h.parentElement;                // <details.fold-panel>
    return h.parentElement;                                             // <label> tiêu đề mục
}

/** [đã điền, tổng] các ô đếm được trong một khối */
function dayVoi(box) {
    const os = [...box.querySelectorAll('input:not([type=hidden]), select, textarea')]
        .filter(f => !f.disabled && !f.readOnly && !f.closest('[data-nocount]')
            && f.offsetParent !== null);
    const co = os.filter(f => f.type === 'checkbox' ? f.checked : String(f.value || '').trim()).length;
    return [co, os.length];
}

function buildRail() {
    const pane = form?.querySelector('.tab-content.active');
    if (!pane) return;
    railItems = [...pane.querySelectorAll('legend, label.text-pink-500, .fold-panel > summary')]
        .filter(h => h.offsetParent !== null)
        .slice(0, 16)
        .map(h => ({ h, box: boxOf(h), ten: labelText(h) }))
        .filter(x => x.ten.length > 1);

    rail.innerHTML = railItems.map((x, i) => {
        const [co, tong] = dayVoi(x.box);
        const st = !tong ? '' : co === tong ? 'is-full' : co ? 'is-part' : '';
        return `<button type="button" class="ol-item ${st}" data-ol="${i}"
            title="${x.ten.replace(/"/g, '')}${tong ? ` — ${co}/${tong} ô đã điền` : ''}">
            <span class="ol-dot"></span><span class="ol-lb">${x.ten}</span></button>`;
    }).join('');
    rail.hidden = !railItems.length;
}

rail.addEventListener('click', e => {
    const b = e.target.closest('[data-ol]');
    if (b) goTo(railItems[+b.dataset.ol]?.h);
});

/* Sáng theo chỗ đang cuộn — lấy tiêu đề cuối cùng còn nằm trên giữa màn hình */
function spyRail() {
    if (!railItems.length) return;
    const moc = innerHeight * 0.35;
    let at = 0;
    railItems.forEach((x, i) => { if (x.h.getBoundingClientRect().top <= moc) at = i; });
    rail.querySelectorAll('.ol-item').forEach((b, i) => b.classList.toggle('is-on', i === at));
}

let railRaf = 0;
addEventListener('scroll', () => {
    if (railRaf) return;
    railRaf = requestAnimationFrame(() => { railRaf = 0; spyRail(); });
}, { passive: true });

/* Dựng lại khi đổi mục và khi vừa gõ xong (chấm màu phải theo kịp) */
tabLinks.forEach(l => l.addEventListener('click', () => setTimeout(() => { buildRail(); spyRail(); }, 320)));
let railTimer = 0;
form?.addEventListener('input', () => {
    clearTimeout(railTimer);
    railTimer = setTimeout(buildRail, 700);
});
setTimeout(() => { buildRail(); spyRail(); }, 800);

/* ------------------------------------------------------------------ */
/* 9. THU GỌN HẾT / MỞ HẾT                                             */
/* Mục Khám có tới hơn hai chục thẻ gấp; ui-fold mở sẵn thẻ nào đã có   */
/* dữ liệu nên đọc lại một lượt là phải cuộn rất dài. Nút này cụp hết   */
/* cho thấy được bộ khung, bấm lần nữa thì bung lại.                    */
/* ------------------------------------------------------------------ */
let dangGon = false;
$('ba-fold')?.addEventListener('click', () => {
    const pane = form?.querySelector('.tab-content.active');
    const ds = [...(pane?.querySelectorAll('details') || [])].filter(d => !d.closest('#ba-settings'));
    if (!ds.length) return showToast('Mục này không có thẻ nào để thu gọn.', 'info');
    dangGon = !dangGon;
    ds.forEach(d => { d.open = !dangGon; });
    $('ba-fold')?.classList.toggle('is-on', dangGon);
    const ic = $('ba-fold')?.querySelector('i');
    if (ic) ic.className = dangGon ? 'fas fa-expand' : 'fas fa-compress';
    showToast(dangGon ? `Đã thu gọn ${ds.length} thẻ — bấm lần nữa để mở lại.`
        : `Đã mở lại ${ds.length} thẻ.`, 'info', 1800);
    buildRail();
});

/* ------------------------------------------------------------------ */
/* 10. CHẾ ĐỘ ĐỌC ĐÊM                                                  */
/* Trực buồng bệnh ban đêm mà nền trắng thì chói mắt. Chỉ đổi bộ biến   */
/* màu trong CSS nên mọi khối cũ tự đi theo, không phải sửa từng lớp.   */
/* ------------------------------------------------------------------ */
let night = localStorage.getItem('baNight') === '1';
function applyNight(save) {
    body.classList.toggle('ba-night', night);
    $('ba-night')?.classList.toggle('is-on', night);
    const ic = $('ba-night')?.querySelector('i');
    if (ic) ic.className = night ? 'fas fa-sun' : 'fas fa-moon';
    if (save) localStorage.setItem('baNight', night ? '1' : '0');
}
applyNight(false);
$('ba-night')?.addEventListener('click', () => {
    night = !night;
    applyNight(true);
    showToast(night ? 'Đã bật chế độ đọc đêm.' : 'Đã trở lại nền sáng.', 'info', 1500);
});
