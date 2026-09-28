/* =====================================================================
   BỐ CỤC BA VÙNG CHO MÀN RỘNG (≥1200px) — 2026-09-28

   Trái  : mục lục dọc. Bảy mục của bệnh án, mục đang mở bung ra từng
           khối nhỏ (Nội khoa, Thuốc, Tim mạch, phiếu CLS, lần đi buồng…),
           mỗi khối một chấm tiến độ; cuộn tới đâu khối đó sáng tới đó.
   Phải  : (≥1560px) thẻ bệnh nhân luôn hiện, các ô còn trống của mục đang
           mở, và ô nháp nhanh.

   Chỉ ĐỌC DOM và bấm hộ nút có sẵn: đổi mục = click đúng .tab-link thật
   (mọi logic đổi tab của tao-benh-an.js vẫn chạy); nhảy tới ô = goTo()
   của tao-benh-an-them.js. Không thêm ô nội dung nào vào bệnh án.

   Hai bảng gắn vào <body>, NẰM NGOÀI <form>: mười module đang quét "mọi
   input/select/textarea trong form" (đếm %, ô trống, gợi ý gõ) — ô nháp
   mà nằm trong form là lọt vào cả mười danh sách.

   Ẩn/hiện hoàn toàn bằng CSS (mau-hong-dao.css, mục 15–16): chế độ Ghim,
   Tập trung thì trả lại thanh mục ngang như cũ.

   ĐIỆN THOẠI (≤640px) dùng CHUNG bộ dữ liệu mục lục này, trình bày khác:
   thanh trên đổi màu theo mục + dải khối nhỏ trượt ngang, thanh đáy 5 nút,
   và chính thanh trái trở thành bảng mục lục trượt từ dưới lên.
   ===================================================================== */
import { goTo, labelOf, dayVoi } from './tao-benh-an-them.js';

const $ = id => document.getElementById(id);
const form = $('medical-record-form');
const tabLinks = [...document.querySelectorAll('#tab-nav .tab-link')];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Chữ của một tiêu đề, bỏ nút / số đếm / ô nhập lẫn bên trong, cắt phần giải thích sau "—" */
function chu(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('input, select, textarea, button, small, .tab-progress, .fold-count, .lb-sub, .sub-label, .hx-q, .hx-no, .hx-oldtip, .caret, [id$="-date"], .filled-dot, .ask')
        .forEach(x => x.remove());
    return c.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim().split(' — ')[0].trim();
}

/* ------------------------------------------------------------------ */
/* 1. THANH TRÁI                                                       */
/* ------------------------------------------------------------------ */
const side = document.createElement('aside');
side.className = 'hd-side';
side.setAttribute('aria-label', 'Mục lục bệnh án');
side.innerHTML = `
    <div class="hd-side-top">
        <span class="hd-side-t"><i class="fas fa-book-medical"></i> Mục lục</span>
        <span class="hd-side-pct" title="Mức hoàn thiện cả bệnh án"><b>0%</b></span>
        <button type="button" class="hd-side-x" data-do="dong" aria-label="Đóng mục lục"><i class="fas fa-xmark"></i></button>
        <span class="hd-side-bar"><i></i></span>
    </div>
    <nav class="hd-nav"></nav>
    <div class="hd-side-tools">
        <button type="button" data-do="ba-search" title="Tìm ô / mục (Ctrl K)"><i class="fas fa-magnifying-glass"></i><span>Tìm</span></button>
        <button type="button" data-do="ba-gap" title="Ô còn trống kế tiếp"><i class="fas fa-location-crosshairs"></i><span>Ô trống</span></button>
        <button type="button" data-do="ba-overview" title="Toàn cảnh ca bệnh (Ctrl ⇧ O)"><i class="fas fa-panorama"></i><span>Toàn cảnh</span></button>
        <button type="button" data-do="ba-trinh" title="Chế độ trình bệnh (Ctrl ⇧ P)"><i class="fas fa-chalkboard-user"></i><span>Trình bệnh</span></button>
    </div>`;
document.body.appendChild(side);
const nav = side.querySelector('.hd-nav');

/* Các "khối nhỏ" trong một mục — theo thứ tự xuất hiện trên trang */
const KHOI = [
    'fieldset > legend',
    'label.text-pink-500',
    'details.fold-panel > summary',
    '[id^="tc-"][id$="-box"] > label:first-child',
    'label[for^="ros-"]',
    'label[for^="exam-"]',
    'label[for="illness-history"]',
    '.hx-head > .calc-title',
    '.grade-box > .calc-title',
    '.cls-c',
    '.td-card',
    '#bl-host .tr-card'
].join(',');

/** Khối chứa một tiêu đề — để đếm ô đã điền; null = không chấm */
function khoiCua(h) {
    if (h.matches('.cls-c, .td-card, .tr-card')) return h;
    if (h.tagName === 'LEGEND' || h.tagName === 'SUMMARY') return h.parentElement;
    if (h.matches('[id^="tc-"] > label, label[for^="ros-"], label[for^="exam-"]')) return h.parentElement;
    if (h.matches('label.text-pink-500') && !h.closest('fieldset')) {
        let b = h;
        while (b.parentElement && !b.parentElement.matches('.tab-content, .tab-content > .flex-col')) b = b.parentElement;
        return b;
    }
    return null;
}

function tenCua(h) {
    if (h.matches('.cls-c')) return h.querySelector('.cls-c-name')?.value.trim() || 'Phiếu chưa đặt tên';
    if (h.matches('.td-card')) {
        const n = h.querySelector('.td-day')?.textContent.trim();
        const w = h.querySelector('.td-when')?.textContent.trim();
        return ['Lần', n, w && '· ' + w].filter(Boolean).join(' ');
    }
    if (h.matches('.tr-card')) return h.querySelector('.tr-title')?.value.trim() || 'Vấn đề chưa đặt tên';
    return chu(h);
}

/** Cấp 1 = tiêu đề mục (legend / nhãn hồng đứng ngoài khung); còn lại là cấp 2 */
const capMot = h => (h.tagName === 'LEGEND' && !h.parentElement.parentElement.closest('fieldset'))
    || (h.matches('label.text-pink-500') && !h.closest('fieldset'));

let items = [];

function dungKhoi(pane) {
    items = [...pane.querySelectorAll(KHOI)]
        .filter(h => h.offsetParent !== null && !h.closest('.hd-side, .hd-util'))
        .map(h => ({ h, box: khoiCua(h), ten: tenCua(h), mot: capMot(h) }))
        .filter(x => x.ten.length > 1)
        .slice(0, 40);
}

function tabPct(l) { return parseInt(l.querySelector('.tab-progress')?.textContent) || 0; }

let htmlCu = '';
function ve() {
    const active = tabLinks.find(l => l.classList.contains('active'));
    const pane = active && $(active.dataset.tab);
    if (pane) dungKhoi(pane);

    const html = tabLinks.map(l => {
        const on = l === active;
        const li = l.closest('li');
        const cs = getComputedStyle(li);
        const vars = ['--sec', '--sec-line', '--sec-tint', '--sec-pill', '--sec-ink']
            .map(v => `${v}:${cs.getPropertyValue(v).trim()}`).filter(x => !/:$/.test(x)).join(';');
        const icon = l.querySelector('.tab-top i')?.className || 'fas fa-circle';
        const so = l.querySelector('.tab-num')?.textContent.trim() || '';
        const ten = l.querySelector('.tab-text')?.textContent.replace(so, '').trim() || '';
        const p = tabPct(l);
        const sub = !on ? '' : `<div class="hd-sub">${items.map((x, i) => {
            const [co, tong] = x.box ? dayVoi(x.box) : [0, 0];
            const st = !tong ? 'no-dot' : co === tong ? 'is-full' : co ? 'is-part' : 'is-empty';
            return `<button type="button" class="hd-it ${x.mot ? 'lv1' : 'lv2'} ${st}" data-i="${i}"
                title="${esc(x.ten)}${tong ? ` — ${co}/${tong} ô đã điền` : ''}"><span class="hd-dot"></span><span class="hd-it-t">${esc(x.ten)}</span>${tong ? `<small>${co}/${tong}</small>` : ''}</button>`;
        }).join('')}</div>`;
        return `<div class="hd-g${on ? ' is-on' : ''}" style="${vars}">
            <button type="button" class="hd-g-h" data-tab="${l.dataset.tab}">
                <i class="${esc(icon)}"></i>
                <span class="hd-g-t">${so ? `<u>${esc(so.replace(/\.\s*$/, ''))}</u>` : ''}${esc(ten)}</span>
                <em class="${p >= 100 ? 'is-full' : ''}">${p}%</em>
                <span class="hd-g-bar"><i style="width:${p}%"></i></span>
            </button>${sub}</div>`;
    }).join('');
    if (html !== htmlCu) { nav.innerHTML = html; htmlCu = html; }

    const n = parseInt($('overall-pct')?.textContent) || 0;
    side.querySelector('.hd-side-pct b').textContent = n + '%';
    side.querySelector('.hd-side-bar i').style.width = n + '%';
    veDT(active, n);
    soi();
    veTienIch();
}

/* Sáng theo chỗ đang cuộn: khối cuối cùng có tiêu đề đã lên tới 30% màn hình */
function soi() {
    if (!items.length) return;
    const moc = innerHeight * 0.3;
    let at = 0;
    items.forEach((x, i) => { if (x.h.getBoundingClientRect().top <= moc) at = i; });
    const btns = nav.querySelectorAll('.hd-it');
    btns.forEach((b, i) => b.classList.toggle('is-on', i === at));
    soiChip(at);
    // Giữ khối đang sáng trong tầm nhìn của danh sách con — chỉ cuộn danh sách,
    // không đụng trang; đang rê chuột trên thanh thì để yên cho người ta chọn
    const b = btns[at], hop = b?.closest('.hd-sub');
    if (hop && !side.matches(':hover')) {
        const nt = hop.getBoundingClientRect(), bt = b.getBoundingClientRect();
        if (bt.top < nt.top + 6 || bt.bottom > nt.bottom - 6) hop.scrollTop += bt.top - nt.top - nt.height / 2;
    }
}

function nhayToi(h) {
    for (let d = h.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    h.closest('fieldset')?.querySelector('legend.foldable.folded')?.click();
    const box = khoiCua(h) || h;
    // Điện thoại có thanh trên dính đầu trang -> chừa đúng chiều cao của nó
    const tren = laDT() ? (thanhTren.offsetHeight || 0) : 0;
    scrollTo({ top: h.getBoundingClientRect().top + scrollY - tren - 16, behavior: 'smooth' });
    box.classList.remove('ba-flash'); void box.offsetWidth; box.classList.add('ba-flash');
    setTimeout(() => box.classList.remove('ba-flash'), 1600);
}

side.addEventListener('click', async e => {
    const g = e.target.closest('.hd-g-h');
    if (g) {
        const l = tabLinks.find(x => x.dataset.tab === g.dataset.tab);
        dongMuc();
        if (l.classList.contains('active')) scrollTo({ top: 0, behavior: 'smooth' });
        else l.click();
        return;
    }
    const it = e.target.closest('.hd-it');
    if (it) { const x = items[+it.dataset.i]; dongMuc(); if (x) setTimeout(() => nhayToi(x.h), laDT() ? 60 : 0); return; }
    const d = e.target.closest('[data-do]');
    if (!d) return;
    dongMuc();
    if (d.dataset.do === 'dong') return;
    // Bốn công cụ lớp nổi được nạp trễ — đợi nạp xong mới bấm, kẻo bấm vào nút chưa có chủ
    await window.napLopNoi?.();
    $(d.dataset.do)?.click();
});

/* ------------------------------------------------------------------ */
/* 2. BẢNG TIỆN ÍCH BÊN PHẢI                                           */
/* ------------------------------------------------------------------ */
const util = document.createElement('aside');
util.className = 'hd-util';
util.setAttribute('aria-label', 'Tiện ích khi viết bệnh án');
util.innerHTML = `
    <section class="hd-card hd-pt">
        <h4><i class="fas fa-id-card"></i> Bệnh nhân</h4>
        <div class="hd-pt-body"></div>
    </section>
    <section class="hd-card hd-gaps">
        <h4><i class="fas fa-list-check"></i> Còn trống ở mục này <b class="hd-gaps-n">0</b></h4>
        <div class="hd-gaps-list"></div>
    </section>
    <section class="hd-card hd-nhap">
        <h4><i class="fas fa-pen-nib"></i> Nháp nhanh</h4>
        <textarea class="hd-nhap-in" rows="6" spellcheck="false"
            placeholder="Ghi vội lúc hỏi bệnh ở giường, lát nữa chép vào đúng ô…"></textarea>
        <small>Chỉ lưu trên máy này, không in vào bệnh án.</small>
    </section>`;
document.body.appendChild(util);

const v = id => ($(id)?.value || '').trim();
const dong = (nhan, gt, id, cls = '') => gt
    ? `<button type="button" class="hd-pt-row ${cls}" data-go="${id}"><span>${nhan}</span><b>${esc(gt)}</b></button>`
    : `<button type="button" class="hd-pt-row is-trong ${cls}" data-go="${id}"><span>${nhan}</span><b>chưa ghi</b></button>`;

function veTienIch() {
    /* Thẻ bệnh nhân: những dữ kiện hay phải cuộn ngược lên tra khi đang biện luận */
    const gioi = v('patient-gender');
    const tuoi = v('patient-age');
    const phu = [gioi, tuoi && tuoi + ' tuổi', v('bed-number') && 'Giường ' + v('bed-number')].filter(Boolean).join(' · ');
    const sh = [['M', 'vital-pulse'], ['HA', 'vital-bp'], ['T°', 'vital-temp'], ['NT', 'vital-resp'], ['SpO2', 'vital-spo2']]
        .map(([k, id]) => `<button type="button" data-go="${id}" class="${v(id) ? '' : 'is-trong'}"><span>${k}</span><b>${esc(v(id) || '–')}</b></button>`).join('');
    util.querySelector('.hd-pt-body').innerHTML = `
        <button type="button" class="hd-pt-name" data-go="patient-name">${esc(v('patient-name') || 'Chưa ghi tên')}</button>
        ${phu ? `<p class="hd-pt-sub">${esc(phu)}</p>` : ''}
        <div class="hd-pt-vs">${sh}</div>
        ${dong('Lý do vào viện', v('reason-for-admission'), 'reason-for-admission', 'is-dai')}
        ${dong('Chẩn đoán sơ bộ', v('dx1-main'), 'dx1-main', 'is-dai')}
        ${v('dx2-main') ? dong('Chẩn đoán xác định', v('dx2-main'), 'dx2-main', 'is-dai') : ''}`;

    /* Ô còn trống — cùng bộ lọc với nút "Ô còn trống" của tao-benh-an-them.js,
       thu hẹp về mục đang mở và những ô đang thật sự hiện ra */
    const pane = form.querySelector('.tab-content.active');
    const trong = pane ? [...pane.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), select, textarea')]
        .filter(f => !f.disabled && !f.readOnly && !f.value.trim() && f.offsetParent !== null
            && !f.closest('#ba-settings, [data-nocount], .bl-raw')) : [];
    oTrong = trong;
    util.querySelector('.hd-gaps-n').textContent = trong.length;
    util.querySelector('.hd-gaps-list').innerHTML = trong.length
        ? trong.slice(0, 10).map((f, i) => `<button type="button" data-gap="${i}"><i class="fas fa-circle"></i>${esc(String(labelOf(f) || 'Ô chưa đặt tên').slice(0, 60))}</button>`).join('')
            + (trong.length > 10 ? `<p class="hd-gaps-more">… và ${trong.length - 10} ô nữa</p>` : '')
        : '<p class="hd-gaps-ok"><i class="fas fa-circle-check"></i> Mục này đã điền kín.</p>';
}
let oTrong = [];

util.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) return goTo($(go.dataset.go));
    const g = e.target.closest('[data-gap]');
    if (g) goTo(oTrong[+g.dataset.gap]);
});

/* Nháp: theo từng bệnh án, chỉ trong localStorage (không đồng bộ, không in) */
const nhap = util.querySelector('.hd-nhap-in');
const khoaNhap = () => 'baNhap_' + ($('medical-record-id')?.value || 'moi');
try { nhap.value = localStorage.getItem(khoaNhap()) || ''; } catch { /* chế độ riêng tư chặn bộ nhớ */ }
let nhapT = 0;
nhap.addEventListener('input', () => {
    clearTimeout(nhapT);
    nhapT = setTimeout(() => {
        try { nhap.value.trim() ? localStorage.setItem(khoaNhap(), nhap.value) : localStorage.removeItem(khoaNhap()); } catch { /* đầy bộ nhớ */ }
    }, 400);
});

/* ------------------------------------------------------------------ */
/* 3. ĐIỆN THOẠI (≤640px)                                              */
/* Trước: đầu trang 3 tầng + dải 7 biểu tượng + thanh ngữ cảnh + thanh  */
/* Lưu + viên đèn logic nổi + nút tròn một tay + thanh mép = 7 lớp giành */
/* chỗ trên một màn 390px. Nay gom về ba chỗ cố định kiểu app:          */
/*   · thanh trên: tên MỤC đang mở (đổi màu theo mục) + vòng %          */
/*   · dải khối nhỏ trượt ngang ngay dưới — chạm là nhảy, cuộn là sáng   */
/*   · thanh đáy 5 nút: Mục lục · Ô trống · Lưu · Xem · Thêm             */
/* Các nút gốc (Lưu, Xem trước, sổ Công cụ, Ô còn trống) VẪN NẰM NGUYÊN  */
/* chỗ cũ — thanh mới chỉ bấm hộ, nên listener của 10 module không đổi.  */
/* ------------------------------------------------------------------ */
const dtMQ = matchMedia('(max-width: 640px)');
function laDT() { return dtMQ.matches; }

const card = document.querySelector('.page-card');
const thanhTren = document.createElement('div');
thanhTren.className = 'hd-top';
thanhTren.innerHTML = `
    <div class="hd-top-bar">
        <a class="hd-top-back" href="${esc(document.querySelector('.ba-back')?.getAttribute('href') || '../study-room/waiting-room.html')}"
            aria-label="Danh sách bệnh án"><i class="fas fa-arrow-left"></i></a>
        <button type="button" class="hd-top-t" data-mo="muc" aria-label="Mở mục lục">
            <b class="hd-top-muc"></b><small class="hd-top-sub"></small>
        </button>
        <button type="button" class="hd-top-ring" data-bam="ba-ring" title="Nhảy tới ô còn trống kế tiếp">
            <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"></circle><circle class="fg" cx="18" cy="18" r="15"></circle></svg>
            <span>0%</span>
        </button>
    </div>
    <div class="hd-chips" aria-label="Các khối trong mục đang mở"></div>`;
card?.insertBefore(thanhTren, card.firstChild);
const chips = thanhTren.querySelector('.hd-chips');

const day = document.createElement('nav');
day.className = 'hd-bn';
day.setAttribute('aria-label', 'Thanh công cụ');
day.innerHTML = `
    <button type="button" data-mo="muc"><i class="fas fa-list-ul"></i><span>Mục lục</span></button>
    <button type="button" data-bam="ba-gap"><i class="fas fa-location-crosshairs"></i><span>Ô trống</span></button>
    <button type="button" data-bam="save-button" class="is-key"><i class="fas fa-floppy-disk"></i><span>Lưu</span></button>
    <button type="button" data-bam="preview-btn"><i class="fas fa-eye"></i><span>Xem</span></button>
    <button type="button" data-bam="dock-more"><i class="fas fa-grip"></i><span>Thêm</span></button>`;
document.body.appendChild(day);

const nen = document.createElement('div');
nen.className = 'hd-side-bg';
document.body.appendChild(nen);

/* Chữ IN HOA của tiêu đề mục ("V. LƯỢC QUA CÁC CƠ QUAN") đọc mệt trên chip nhỏ */
function nhoChu(t) {
    if (t !== t.toUpperCase() || !/[A-ZĐ]/.test(t)) return t;
    const m = t.match(/^([IVXL]+(?:\s*[–-]\s*[IVXL]+)?\.\s*)?(.*)$/);
    const than = (m[2] || '').toLowerCase();
    return (m[1] || '') + than.charAt(0).toUpperCase() + than.slice(1);
}

let chipCu = '';
function veDT(active, n) {
    if (!active) return;
    const li = active.closest('li');
    const cs = getComputedStyle(li);
    ['--sec', '--sec-line', '--sec-tint', '--sec-pill', '--sec-ink'].forEach(v => {
        const g = cs.getPropertyValue(v).trim();
        if (g) thanhTren.style.setProperty(v, g);
    });
    const so = active.querySelector('.tab-num')?.textContent.trim() || '';
    thanhTren.querySelector('.hd-top-muc').textContent =
        (so ? so + ' ' : '') + (active.querySelector('.tab-text')?.textContent.replace(so, '').trim() || '');
    ghiDongPhu();
    const vong = thanhTren.querySelector('.hd-top-ring');
    vong.style.setProperty('--p', n / 100);
    vong.querySelector('span').textContent = n + '%';
    vong.classList.toggle('is-full', n >= 100);

    const html = items.map((x, i) => {
        const [co, tong] = x.box ? dayVoi(x.box) : [0, 0];
        const st = !tong ? 'no-dot' : co === tong ? 'is-full' : co ? 'is-part' : 'is-empty';
        return `<button type="button" class="hd-chip ${x.mot ? 'lv1' : ''} ${st}" data-i="${i}"><span class="hd-dot"></span>${esc(nhoChu(x.ten))}</button>`;
    }).join('');
    if (html !== chipCu) { chips.innerHTML = html; chipCu = html; chipAt = -1; }
    chips.hidden = items.length < 2;      // một khối thì dải chỉ lặp lại tên mục
}

/* Dòng phụ dưới tên mục: loại bệnh án · tình trạng lưu (tự lưu ghi đè #save-state liên tục) */
const luuEl = $('save-state');
function ghiDongPhu() {
    const tieuDe = document.querySelector('.ba-hero .page-title')?.textContent.trim() || 'Bệnh án';
    const luu = luuEl?.textContent.replace(/\s+/g, ' ').trim() || '';
    thanhTren.querySelector('.hd-top-sub').textContent = [tieuDe, luu].filter(Boolean).join(' · ');
}
if (luuEl) new MutationObserver(ghiDongPhu).observe(luuEl, { childList: true, characterData: true, subtree: true });

/* Chip đang sáng luôn nằm trong tầm nhìn của dải — chỉ cuộn DẢI, không cuộn trang */
let chipAt = -1;
function soiChip(at) {
    if (at === chipAt) return;
    chipAt = at;
    const cs = chips.querySelectorAll('.hd-chip');
    cs.forEach((c, i) => c.classList.toggle('is-on', i === at));
    const c = cs[at];
    if (c && laDT()) chips.scrollTo({ left: c.offsetLeft - chips.clientWidth / 2 + c.offsetWidth / 2, behavior: 'smooth' });
}

chips.addEventListener('click', e => {
    const c = e.target.closest('.hd-chip');
    if (c) { const x = items[+c.dataset.i]; if (x) nhayToi(x.h); }
});

/* Mục lục trượt từ dưới lên = chính thanh trái của máy tính. Nút Back của
   máy đóng bảng (đẩy một mốc lịch sử) thay vì rời trang đang soạn dở. */
function moMuc() {
    ve();
    document.body.classList.add('hd-muc-mo');
    try { history.pushState({ hdMuc: 1 }, ''); } catch { /* iframe sandbox */ }
    setTimeout(() => side.querySelector('.hd-g.is-on')?.scrollIntoView({ block: 'nearest' }), 30);
}
function dongMuc(tuBack) {
    if (!document.body.classList.contains('hd-muc-mo')) return;
    document.body.classList.remove('hd-muc-mo');
    if (!tuBack && history.state?.hdMuc) {
        /* history.back() kéo theo việc trình duyệt tự trả vị trí cuộn của mốc cũ —
           đè mất cú nhảy tới khối vừa chọn. Tắt khôi phục cuộn đúng một lần. */
        try { history.scrollRestoration = 'manual'; history.back(); } catch { /* bỏ qua */ }
    }
}
addEventListener('popstate', () => {
    dongMuc(true);
    setTimeout(() => { try { history.scrollRestoration = 'auto'; } catch { /* bỏ qua */ } }, 0);
});
nen.addEventListener('click', () => dongMuc());
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('hd-muc-mo')) dongMuc(); });

async function bamHo(e) {
    if (e.target.closest('[data-mo]')) return moMuc();
    const b = e.target.closest('[data-bam]');
    if (!b) return;
    await window.napLopNoi?.();
    $(b.dataset.bam)?.click();
}
thanhTren.addEventListener('click', bamHo);
day.addEventListener('click', bamHo);

/* Mọi lối mở "mục lục" cũ trên điện thoại (nút ☰ của thanh ngữ cảnh, kéo xuống
   ở đầu trang của mot-tay.js, nút #sec-picker) đều đi qua #sec-picker.click()
   -> chặn ở pha capture rồi mở bảng mới: một mục lục duy nhất, không hai bảng. */
addEventListener('click', e => {
    if (!laDT() || !e.target.closest?.('#sec-picker')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    moMuc();
}, true);

/* ------------------------------------------------------------------ */
/* 4. KHI NÀO VẼ LẠI                                                   */

/* ------------------------------------------------------------------ */
let hen = 0;
const veSau = (ms = 500) => { clearTimeout(hen); hen = setTimeout(ve, ms); };
tabLinks.forEach(l => l.addEventListener('click', () => veSau(330)));
['input', 'change'].forEach(t => form.addEventListener(t, () => veSau(600)));
form.addEventListener('click', () => veSau(700));          // thêm phiếu / thêm mốc / mở hộp gập
form.addEventListener('toggle', () => veSau(250), true);    // <details> mở / đóng
const pct = $('overall-pct');
if (pct) new MutationObserver(() => veSau(300)).observe(pct, { childList: true, characterData: true, subtree: true });

let raf = 0;
addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; soi(); });
}, { passive: true });

// Bệnh án có sẵn được nạp bất đồng bộ — vẽ lại vài nhịp đầu cho kịp dữ liệu
ve();
setTimeout(ve, 900);
setTimeout(ve, 2500);
