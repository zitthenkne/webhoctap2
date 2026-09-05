import { showToast } from '../../core/utils.js';
import { getRecord, syncFromCloud, authReady, isSignedIn } from './record-store.js';
import { auth } from '../../core/firebase-init.js';
import { clsToHtml, clsToWordHtml, abnormalItems, refText, FLAG_MARK } from './cls-shared.js';
import { buildModel, VITAL_RANGE, toMarkdown, slugName, downloadMarkdown } from './benh-an-text.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Bỏ dấu TỪNG KÝ TỰ nên chuỗi kết quả dài đúng bằng chuỗi gốc — nhờ vậy tìm
   "phoi" vẫn nhảy đúng vị trí chữ "phổi" trong văn bản gốc để tô vàng. */
const fold = (s) => [...String(s)].map(c => {
    const b = c.normalize('NFD')[0];   // NFD đẩy dấu ra sau, ký tự đầu chính là chữ gốc
    return b === 'đ' ? 'd' : b === 'Đ' ? 'D' : b;
}).join('').toLowerCase();

const recordId = new URL(location.href).searchParams.get('id');
const $ = (id) => document.getElementById(id);

/* Khai báo sớm: applyPrivate() chạy ngay lúc nạp có gọi clearSearch(), mà
   const/let không được hoisted như function -> để dưới là vỡ TDZ. */
const searchBar = $('search-bar'), searchInput = $('search-input'), searchCount = $('search-count');
let hits = [], hitIdx = -1;

/* Màu pastel xoay vòng cho từng mục — hường phấn vẫn chiếm phân nửa */
const ACCENTS = ['pink', 'mint', 'pink', 'lavender', 'pink', 'peach', 'pink', 'sky', 'pink', 'lemon'];

/* Nhãn thuộc diện che khi bật chế độ riêng tư */
const PRIVATE_KIND = (label) =>
    /SĐT|Điện thoại/i.test(label) ? 'phone'
        : /Họ và tên|Người liên hệ|Người khai|Người nuôi/i.test(label) ? 'name'
            : /Địa chỉ|Nơi ở/i.test(label) ? 'text' : '';

function maskBy(kind, text) {
    const s = String(text || '').trim();
    if (!s) return s;
    if (kind === 'phone') return s.slice(0, 3) + '•'.repeat(Math.max(3, s.length - 3));
    if (kind === 'name') {
        const w = s.split(/\s+/);
        return w.length < 2 ? w[0][0] + '•••' : w[0] + ' ' + w.slice(1).map(x => x[0].toUpperCase() + '.').join(' ');
    }
    return '••• (đã ẩn)';
}


/* ============================== RENDER MỤC ============================== */
function vitalsHtml(items, caption) {
    const chips = items.filter(([, v]) => String(v ?? '').trim()).map(([label, v, unit]) => {
        const range = VITAL_RANGE[label];
        const num = parseFloat(v);
        const warn = range && !isNaN(num) && (num < range[0] || num > range[1]);
        return `<span class="vital-chip${warn ? ' is-warn' : ''}">
            <span class="lbl">${esc(label)}</span>
            <b>${esc(v)}${unit ? ' ' + unit : ''}</b>
            ${warn ? '<i class="fas fa-triangle-exclamation" style="color:#e79a56;font-size:9px"></i>' : ''}
        </span>`;
    }).join('');
    if (!chips) return '';
    return (caption ? `<div class="xb-cap">${esc(caption)}</div>` : '')
        + `<div class="xb-vitals">${chips}</div>`;
}

/** Ảnh lâm sàng / ảnh hồ sơ — dùng lại class của phiếu CLS nên bấm vào cũng phóng to được */
function anhHtml(list, caption) {
    const imgs = (list || []).filter(im => im && im.url).map(im => `<figure class="cls-fig">
        <img class="cls-img" src="${esc(im.url)}" alt="${esc(im.caption || caption)}" loading="lazy">
        ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    if (!imgs) return '';
    return `<div class="xb-cap">${esc(caption)}</div><div class="cls-imgs">${imgs}</div>`;
}

function fieldHtml(label, value) {
    if (!String(value ?? '').trim()) return '';
    const kind = PRIVATE_KIND(label);
    // Số điện thoại: bấm là gọi được luôn trên điện thoại
    const tel = /SĐT|Điện thoại/i.test(label) && String(value).replace(/[^0-9+]/g, '');
    const inner = tel && tel.length >= 8
        ? `<a href="tel:${esc(tel)}">${esc(value)}</a>`
        : esc(value);
    const shown = `<span class="field-value"${kind ? ` data-private="${kind}"` : ''}>${inner}</span>`;
    return `<div class="xb-f">${label ? `<span class="field-label">${esc(label)}:</span> ` : ''}${shown}</div>`;
}

function sectionHtml(title, icon, rows, index) {
    const body = rows.map(([label, value, extra]) =>
        label === '@vitals' ? vitalsHtml(value, extra)
            : label === '@cls' ? clsToHtml(value)
                : label === '@anh' ? anhHtml(value, extra)
                    : fieldHtml(label, value)).join('');
    if (!body) return '';
    // Hành chính toàn là dòng ngắn -> xếp 2 cột cho đỡ dài
    const cls = index === 0 ? 'xb-sec-body sec-grid' : 'xb-sec-body';
    return `<section id="sec-${index}" class="rec-section xb-sec" data-accent="${ACCENTS[index % ACCENTS.length]}">
        <button class="xb-sec-head" aria-expanded="true">
            <span class="xb-sec-ic"><i class="fas ${icon}"></i></span>
            <span class="xb-sec-t">${esc(title)}</span>
            <i class="fas fa-chevron-down xb-chev"></i>
        </button>
        <div class="${cls}">${body}</div>
    </section>`;
}

function emptyHtml(icon, title, text, btn) {
    return `<div class="xb-empty">
        <div class="xb-empty-ic"><i class="fas ${icon}"></i></div>
        <h2>${title}</h2><p>${text}</p>
        ${btn || ''}
    </div>`;
}


/* ============================== NẠP BỆNH ÁN ============================== */
let record = recordId ? getRecord(recordId) : null;
if (!record && recordId && await authReady()) {
    await syncFromCloud();
    record = getRecord(recordId);
}

const view = $('medical-record-view');
const actions = {};
let sections = [];

if (!record) {
    $('snapshot').innerHTML = '';
    view.innerHTML = emptyHtml('fa-file-circle-question', 'Không tìm thấy bệnh án',
        isSignedIn() ? 'Bệnh án này không có trong tài khoản của bạn.'
            : 'Bệnh án đang lưu trên máy đã tạo. Hãy đăng nhập để đồng bộ giữa các thiết bị.',
        `<a href="../study-room/waiting-room.html" class="xb-btn xb-primary" style="margin-top:16px"><i class="fas fa-arrow-left"></i>Về danh sách bệnh án</a>`);
    document.querySelector('aside.xb-toc').hidden = true;
    $('dock').hidden = true;
} else {
    const model = buildModel(record);
    sections = model.map(([t, i, rows], idx) => ({ title: t, html: sectionHtml(t, i, rows, idx), idx }))
        .filter(s => s.html);

    view.innerHTML = sections.length ? sections.map(s => s.html).join('')
        : emptyHtml('fa-pen-to-square', 'Bệnh án này chưa có nội dung', 'Bấm Sửa để bắt đầu điền.',
            `<a href="tao-benh-an.html?id=${encodeURIComponent(record.id)}" class="xb-btn xb-primary" style="margin-top:16px"><i class="fas fa-pen"></i>Sửa bệnh án</a>`);

    const h = record.hanhChinh || {};
    const name = h.hoTen || 'Chưa đặt tên';

    /* ---------- 1. THẺ TỔNG QUAN + BẢNG CHỈ SỐ BẤT THƯỜNG ---------- */
    const daysFrom = (ymd) => {
        const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return 0;
        const t = new Date(); t.setHours(0, 0, 0, 0);
        return Math.floor((t - new Date(+m[1], +m[2] - 1, +m[3])) / 864e5) + 1;
    };

    /** Gom mọi con số nằm ngoài khoảng tham chiếu: sinh hiệu + toàn bộ phiếu CLS */
    function abnormalRows() {
        const out = [];
        const s = record.khamBenh?.sinhTon || {};
        [['Mạch', s.mach, 'lần/phút'], ['Nhiệt độ', s.nhietDo, '°C'],
        ['Nhịp thở', s.nhipTho, 'lần/phút'], ['SpO2', s.spo2, '%']].forEach(([n, v, u]) => {
            const r = VITAL_RANGE[n], x = parseFloat(v);
            if (!r || isNaN(x) || (x >= r[0] && x <= r[1])) return;
            out.push({ n, v, u, flag: x < r[0] ? 'low' : 'high', from: 'Sinh hiệu', ref: `${r[0]} – ${r[1]}` });
        });
        abnormalItems(record.canLamSang).forEach(i =>
            out.push({ n: i.n, v: i.v, u: i.u, flag: i.flag, from: i.from, ref: refText(i.lo, i.hi) }));
        return out;
    }
    const abn = abnormalRows();
    // Mục cận lâm sàng để bấm vào dòng bất thường là nhảy tới
    const clsSec = sections.find(s => /CẬN LÂM SÀNG/.test(s.title) && /XII/.test(s.title)) || sections[0];

    const vit = record.khamBenh?.sinhTon || {};
    const adm = record.benhSuChiTiet?.sinhHieuNhapVien || {};
    const pick = (a, b) => String(a ?? '').trim() || String(b ?? '').trim();
    const snapVitals = [
        ['Mạch', pick(vit.mach, adm.mach), 'l/p'], ['HA', pick(vit.huyetAp, adm.huyetAp), 'mmHg'],
        ['Nhiệt độ', pick(vit.nhietDo, adm.nhietDo), '°C'], ['SpO2', pick(vit.spo2, adm.spo2), '%'],
        ['BMI', vit.bmi, '']
    ].filter(([, v]) => v);

    const dx = String(record.chanDoanXacDinh || '').trim()
        || String(record.chanDoanSoBo || '').trim() || String(record.lyDoVaoVien || '').trim();
    const dxLabel = record.chanDoanXacDinh ? 'Chẩn đoán xác định'
        : record.chanDoanSoBo ? 'Chẩn đoán sơ bộ' : 'Lý do vào viện';

    const done = sections.length, total = model.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const C = 2 * Math.PI * 22;

    const dayN = daysFrom(h.ngayVaoVien);
    const initials = name.trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase() || '?';

    $('snapshot').innerHTML = `<div class="xb-snap">
        <div class="xb-snap-top">
            <div class="xb-ava">${esc(initials)}</div>
            <div style="min-width:0;flex:1">
                <h2 class="xb-snap-name"><span data-private="name">${esc(name)}</span></h2>
                <p class="xb-snap-sub">${esc([h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.khoa, h.benhVien,
        h.soPhong && 'P.' + h.soPhong, (h.soGiuong || h.bedNumber) && 'G.' + (h.soGiuong || h.bedNumber)]
        .filter(Boolean).join(' · ') || 'Chưa có phần hành chính')}</p>
            </div>
            <div class="xb-ring" title="${done}/${total} mục đã có nội dung">
                <svg width="52" height="52" aria-hidden="true">
                    <circle cx="26" cy="26" r="22" fill="none" stroke="#ffe0ee" stroke-width="5"></circle>
                    <circle cx="26" cy="26" r="22" fill="none" stroke="#f2669f" stroke-width="5" stroke-linecap="round"
                        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"></circle>
                </svg><b>${pct}%</b>
            </div>
        </div>

        ${dx ? `<div class="xb-dx"><b>${dxLabel}:</b> ${esc(dx.split('\n')[0])}</div>` : ''}

        <div class="xb-pills">
            ${dayN > 0 ? `<span class="xb-pill is-mint">Nằm viện <b>ngày ${dayN}</b></span>` : ''}
            ${snapVitals.map(([l, v, u]) => {
            const r = VITAL_RANGE[l === 'HA' ? 'Huyết áp' : l], x = parseFloat(v);
            const warn = r && !isNaN(x) && (x < r[0] || x > r[1]);
            return `<span class="xb-pill${warn ? ' is-warn' : ''}">${esc(l)} <b>${esc(v)}${u ? ' ' + u : ''}</b></span>`;
        }).join('')}
            ${abn.length ? `<button class="xb-pill is-warn" id="abn-toggle" aria-expanded="false">
                <i class="fas fa-triangle-exclamation" style="font-size:10px"></i> <b>${abn.length}</b> chỉ số bất thường</button>` : ''}
            <span class="xb-pill is-info">${done}/${total} mục</span>
        </div>

        ${abn.length ? `<div class="xb-abn" id="abn-panel" hidden>
            <div class="xb-abn-h">Chỉ số ngoài khoảng tham chiếu</div>
            ${abn.map(a => `<div class="xb-abn-row is-${a.flag}">
                <span class="n">${esc(a.n)}<small>${esc(a.from || '')}</small></span>
                <span class="v">${esc(a.v)}${a.u ? ' ' + esc(a.u) : ''} ${FLAG_MARK[a.flag]}</span>
                ${a.ref ? `<span class="r">${esc(a.ref)}</span>` : ''}
            </div>`).join('')}
        </div>` : ''}
    </div>`;

    // Mở / đóng bảng bất thường; bấm một dòng thì nhảy tới mục cận lâm sàng
    $('abn-toggle')?.addEventListener('click', () => {
        const p = $('abn-panel');
        p.hidden = !p.hidden;
        $('abn-toggle').setAttribute('aria-expanded', String(!p.hidden));
    });
    $('abn-panel')?.addEventListener('click', (e) => {
        if (e.target.closest('.xb-abn-row')) jumpTo('sec-' + clsSec.idx);
    });

    /* ---------- Mục lục ---------- */
    const tocHtml = sections.map(s =>
        `<a href="#sec-${s.idx}" class="toc-link" data-target="sec-${s.idx}"><span class="dot"></span>${esc(s.title)}</a>`).join('');
    $('toc-nav').innerHTML = tocHtml;
    $('toc-nav-mobile').innerHTML = tocHtml;

    /* ---------- Đầu trang + khối ký tên ---------- */
    document.title = 'Bệnh án - ' + name;
    $('head-name').innerHTML = `<span data-private="name">${esc(name)}</span>`;
    const meta = [h.tuoi && h.tuoi + ' tuổi', h.gioiTinh, h.benhVien,
    (h.soPhong || h.roomNumber) && 'P.' + (h.soPhong || h.roomNumber)].filter(Boolean).join(' · ');
    $('head-meta').textContent = meta;
    $('print-sub').innerHTML = `<span data-private="name">${esc(name)}</span>${meta ? ' — ' + esc(meta) : ''}`;

    const editBtn = $('edit-record-btn');
    editBtn.href = 'tao-benh-an.html?id=' + encodeURIComponent(record.id);
    editBtn.hidden = false;
    [$('edit-link-mobile'), $('edit-top-mobile')].forEach(a => { a.href = editBtn.href; a.hidden = false; });

    const dm = String(h.ngayLamBenhAn || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    $('sign-date').textContent = dm
        ? `Ngày ${dm[3]} tháng ${dm[2]} năm ${dm[1]}`
        : 'Ngày ......  tháng ......  năm ..........';
    authReady().then(() => {
        const u = auth.currentUser;
        $('sign-name').textContent = u ? (u.displayName || (u.email || '').split('@')[0] || '') : '';
    });

    /* ---------- Đánh dấu mục đang xem trong mục lục ---------- */
    const links = [...document.querySelectorAll('.toc-link')];
    const observer = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            links.forEach(l => l.classList.toggle('active', l.dataset.target === en.target.id));
        });
    }, { rootMargin: '-90px 0px -68% 0px' });
    document.querySelectorAll('.rec-section').forEach(s => observer.observe(s));


    /* ============================== XUẤT / CHIA SẺ ============================== */
    const plain = () => toMarkdown(record, model);

    /* Bản HTML của bệnh án: vừa là ruột của file .doc tải về, vừa là mặt hàng
       'text/html' đặt lên clipboard — dán thẳng vào Google Docs / Word là ra đúng
       heading, in đậm, gạch đầu dòng, khỏi phải tải file rồi mở lại. */
    /* Ô nhiều dòng (tóm tắt, đặt vấn đề, biện luận): dòng bắt đầu bằng "- " gom
       thành <ul> thật. Nối bằng <br> như trước thì dán sang Google Docs / Word ra
       một khối chữ còn nguyên dấu gạch và khoảng trắng thụt lề. */
    const khoiHtml = (label, value) => {
        const rows = String(value).split('\n').map(x => x.trim()).filter(Boolean);
        let out = '', ul = [];
        const xaUl = () => {
            if (!ul.length) return;
            out += `<ul>${ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
            ul = [];
        };
        rows.forEach((x, i) => {
            if (/^[-*•]\s+/.test(x)) return void ul.push(x.replace(/^[-*•]\s+/, ''));
            xaUl();
            out += `<p>${label && i === 0 ? '<b>' + esc(label) + ':</b> ' : ''}${esc(x)}</p>`;
        });
        xaUl();
        return out;
    };

    const docHtml = () => {
        const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
            <style>body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5}
            h2{text-align:center;font-size:14pt;text-transform:uppercase}
            h3{font-size:13pt;border-bottom:1px solid #000;margin:14pt 0 6pt}
            p{margin:0 0 4pt}</style></head><body>
            ${[record.sinhVien?.hoTen, record.sinhVien?.mssv, record.sinhVien?.lop, record.sinhVien?.stt]
                .filter(Boolean).length ? `<p>${esc([record.sinhVien?.hoTen, record.sinhVien?.mssv, record.sinhVien?.lop, record.sinhVien?.stt].filter(Boolean).join(' - '))}</p>` : ''}
            <h2>Bệnh án</h2>` +
            model.map(([title, , rows]) => {
                const body = rows.map(([label, value]) => {
                    if (label === '@vitals') {
                        const v = value.filter(([, x]) => String(x ?? '').trim())
                            .map(([l, x, u]) => `${l}: ${x}${u ? ' ' + u : ''}`).join(' · ');
                        return v ? `<p>${esc(v)}</p>` : '';
                    }
                    if (label === '@cls') return clsToWordHtml(value);
                    if (label === '@anh') {
                        const co = (value || []).filter(im => im && im.url);
                        return co.length ? co.map(im => `<p><img src="${esc(im.url)}" width="420">`
                            + (im.caption ? `<br><i>${esc(im.caption)}</i>` : '') + '</p>').join('') : '';
                    }
                    if (!String(value ?? '').trim()) return '';
                    return khoiHtml(label, value);
                }).join('');
                return body ? `<h3>${esc(title)}</h3>${body}` : '';
            }).join('') + '<\/body><\/html>';
        return html;
    };

    Object.assign(actions, {
        print: () => window.print(),
        edit: () => { location.href = editBtn.href; },
        copy: async () => {
            /* Dán vào Google Docs mà chỉ có chữ trơn thì heading, in đậm, gạch đầu
               dòng rơi hết — phải đặt LÊN CLIPBOARD CẢ HAI mặt hàng: 'text/html' cho
               Docs / Word ăn định dạng, 'text/plain' là bản Markdown cho ô chat, ghi
               chú, hay trình soạn thảo chữ trơn. */
            try {
                const md = plain();
                if (window.ClipboardItem && navigator.clipboard?.write) {
                    await navigator.clipboard.write([new ClipboardItem({
                        'text/html': new Blob([docHtml()], { type: 'text/html' }),
                        'text/plain': new Blob([md], { type: 'text/plain' })
                    })]);
                    showToast('Đã sao chép — dán thẳng vào Google Docs / Word là giữ nguyên định dạng.', 'success', 5000);
                    return;
                }
                await navigator.clipboard.writeText(md);
                showToast('Đã sao chép bản Markdown.', 'success');
            } catch {
                showToast('Trình duyệt chặn sao chép. Hãy chọn và copy thủ công.', 'error');
            }
        },
        txt: () => {
            downloadMarkdown(record, model);
            showToast('Đã tải file .md — kéo thẳng vào Google Drive rồi mở bằng Google Docs, heading tự lên sẵn.', 'success');
        },
        word: () => {
            const html = docHtml();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
            a.download = `benh-an-${slugName(h.hoTen)}.doc`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('Đã tải file Word.', 'success');
        },
        share: async () => {
            try { await navigator.share({ title: 'Bệnh án - ' + name, text: plain() }); }
            catch { /* người dùng hủy */ }
        },
        search: () => openSearch(),
        present: () => openPresent(0)
    });

    if (navigator.share) $('share-btn').hidden = false;
    $('pr-who').textContent = name;
}


/* ============================== 2. THU GỌN MỤC + CỠ CHỮ ============================== */
const KEY_FOLD = 'xbFold_' + (recordId || 'x');
const foldState = new Set(JSON.parse(localStorage.getItem(KEY_FOLD) || '[]'));
const saveFold = () => localStorage.setItem(KEY_FOLD, JSON.stringify([...foldState]));

foldState.forEach(id => {
    const s = document.getElementById(id);
    if (s) { s.classList.add('is-closed'); s.querySelector('.xb-sec-head')?.setAttribute('aria-expanded', 'false'); }
});

function toggleSec(sec, force) {
    const closed = force !== undefined ? force : !sec.classList.contains('is-closed');
    sec.classList.toggle('is-closed', closed);
    sec.querySelector('.xb-sec-head')?.setAttribute('aria-expanded', String(!closed));
    closed ? foldState.add(sec.id) : foldState.delete(sec.id);
    saveFold();
}

function jumpTo(id) {
    const sec = document.getElementById(id);
    if (!sec) return;
    if (sec.classList.contains('is-closed')) toggleSec(sec, false);
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sec.classList.remove('is-flash');
    void sec.offsetWidth;
    sec.classList.add('is-flash');
}

const FS = [0.88, 1, 1.14, 1.3];
let fsIdx = +(localStorage.getItem('xbFs') ?? 1);
function applyFs() {
    fsIdx = Math.max(0, Math.min(FS.length - 1, fsIdx));
    document.documentElement.style.setProperty('--fs', (15.5 * FS[fsIdx]).toFixed(1) + 'px');
    $('fs-val').textContent = Math.round(FS[fsIdx] * 100) + '%';
    localStorage.setItem('xbFs', fsIdx);
}
applyFs();
$('fs-up').addEventListener('click', () => { fsIdx++; applyFs(); });
$('fs-down').addEventListener('click', () => { fsIdx--; applyFs(); });

const foldSwitch = $('fold-switch');
foldSwitch.addEventListener('click', () => {
    const on = !foldSwitch.classList.contains('is-on');
    foldSwitch.classList.toggle('is-on', on);
    foldSwitch.setAttribute('aria-checked', String(on));
    document.querySelectorAll('.xb-sec').forEach(s => toggleSec(s, on));
});


/* ============================== 3. CHẾ ĐỘ RIÊNG TƯ ============================== */
const privSwitch = $('private-switch');
let priv = localStorage.getItem('xbPrivate') === '1';

function applyPrivate(on) {
    clearSearch();
    document.querySelectorAll('[data-private]').forEach(el => {
        if (el.dataset.real === undefined) el.dataset.real = el.innerHTML;
        if (on) el.textContent = maskBy(el.dataset.private, el.dataset.real.replace(/<[^>]+>/g, ''));
        else el.innerHTML = el.dataset.real;
        el.classList.toggle('xb-masked', on);
    });
    privSwitch.classList.toggle('is-on', on);
    privSwitch.setAttribute('aria-checked', String(on));
    localStorage.setItem('xbPrivate', on ? '1' : '0');
}
if (priv) applyPrivate(true);
privSwitch.addEventListener('click', () => {
    priv = !priv;
    applyPrivate(priv);
    showToast(priv ? 'Đã che tên, địa chỉ, số điện thoại — in ra cũng che.' : 'Đã hiện lại thông tin bệnh nhân.', 'info');
});


/* ============================== 4. TÌM TRONG BỆNH ÁN ============================== */
function clearSearch() {
    view.querySelectorAll('mark.xb-hit').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
    view.normalize();
    hits = []; hitIdx = -1;
    searchCount.textContent = '';
}

function runSearch(q) {
    clearSearch();
    const needle = fold(q.trim());
    if (needle.length < 2) return;

    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => n.nodeValue.trim() && n.parentNode.nodeName !== 'MARK'
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(n => {
        const raw = n.nodeValue, hay = fold(raw);   // fold giữ nguyên độ dài -> chỉ số khớp 1:1
        let from = 0, at = hay.indexOf(needle), last = 0;
        if (at < 0) return;
        const frag = document.createDocumentFragment();
        while (at >= 0) {
            if (at > last) frag.append(raw.slice(last, at));
            const mk = document.createElement('mark');
            mk.className = 'xb-hit';
            mk.textContent = raw.slice(at, at + needle.length);
            frag.append(mk);
            last = at + needle.length;
            from = last;
            at = hay.indexOf(needle, from);
        }
        frag.append(raw.slice(last));
        n.replaceWith(frag);
    });

    hits = [...view.querySelectorAll('mark.xb-hit')];
    if (hits.length) gotoHit(0); else searchCount.textContent = '0';
}

function gotoHit(i) {
    if (!hits.length) return;
    hitIdx = (i + hits.length) % hits.length;
    hits.forEach(m => m.classList.remove('is-cur'));
    const m = hits[hitIdx];
    m.classList.add('is-cur');
    const sec = m.closest('.xb-sec');
    if (sec?.classList.contains('is-closed')) toggleSec(sec, false);   // mục đang gấp thì mở ra
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchCount.textContent = `${hitIdx + 1}/${hits.length}`;
}

function openSearch() {
    searchBar.classList.add('is-open');
    searchInput.focus();
    searchInput.select();
}
function closeSearch() {
    searchBar.classList.remove('is-open');
    clearSearch();
}

let tid;
searchInput.addEventListener('input', () => {
    clearTimeout(tid);
    tid = setTimeout(() => runSearch(searchInput.value), 180);
});
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoHit(hitIdx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') closeSearch();
});
$('search-next').addEventListener('click', () => gotoHit(hitIdx + 1));
$('search-prev').addEventListener('click', () => gotoHit(hitIdx - 1));
$('search-close').addEventListener('click', closeSearch);
$('search-btn').addEventListener('click', () => searchBar.classList.contains('is-open') ? closeSearch() : openSearch());


/* ============================== 5. CHẾ ĐỘ TRÌNH BỆNH ============================== */
const present = $('present'), prBody = $('pr-body');
let prIdx = 0;

function renderPresent() {
    const s = sections[prIdx];
    // Đổi id để không đụng với id của mục ngoài trang (mục lục, IntersectionObserver)
    prBody.innerHTML = s.html.replace('id="sec-', 'id="psec-');
    prBody.scrollTop = 0;
    $('pr-count').textContent = `${prIdx + 1} / ${sections.length}`;
    $('pr-dots').innerHTML = sections.map((_, i) => `<i class="${i === prIdx ? 'on' : ''}"></i>`).join('');
    $('pr-prev').disabled = prIdx === 0;
    $('pr-next').disabled = prIdx === sections.length - 1;
}
function openPresent(i) {
    if (!sections.length) return;
    prIdx = i;
    present.hidden = false;
    renderPresent();
}
const closePresent = () => { present.hidden = true; };
const stepPresent = (d) => {
    const n = prIdx + d;
    if (n < 0 || n >= sections.length) return;
    prIdx = n;
    renderPresent();
};

$('pr-exit').addEventListener('click', closePresent);
$('pr-prev').addEventListener('click', () => stepPresent(-1));
$('pr-next').addEventListener('click', () => stepPresent(1));
$('present-btn').addEventListener('click', () => openPresent(0));
$('print-btn').addEventListener('click', () => window.print());
$('pr-dots').addEventListener('click', (e) => {
    const dots = [...$('pr-dots').children];
    const i = dots.indexOf(e.target);
    if (i >= 0) { prIdx = i; renderPresent(); }
});

// Vuốt trái / phải để lật mục trên điện thoại
let tx = 0, ty = 0;
prBody.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
prBody.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) stepPresent(dx < 0 ? 1 : -1);
}, { passive: true });


/* ============================== THẺ TRƯỢT + DOCK ============================== */
function openSheet(id) {
    const s = $('sheet-' + id);
    if (!s) return;
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add('is-open'));
}
function closeSheets() {
    document.querySelectorAll('.xb-sheet.is-open').forEach(s => {
        s.classList.remove('is-open');
        // Bấm lại đúng thẻ vừa đóng thì nó mở lại ngay -> hẹn giờ cũ không được giấu nhầm
        setTimeout(() => { if (!s.classList.contains('is-open')) s.hidden = true; }, 240);
    });
}

document.addEventListener('click', (e) => {
    const sh = e.target.closest('[data-sheet]');
    if (sh) { closeSheets(); return openSheet(sh.dataset.sheet); }
    if (e.target.closest('[data-close]')) return closeSheets();

    const link = e.target.closest('.toc-link');
    if (link) {
        e.preventDefault();
        closeSheets();
        jumpTo(link.dataset.target);
        return;
    }

    const act = e.target.closest('[data-act]');
    if (act) {
        if (act.dataset.act !== 'search') closeSheets();
        actions[act.dataset.act]?.();
        return;
    }

    const head = e.target.closest('.xb-sec-head');
    if (head && !e.target.closest('#present')) toggleSec(head.parentElement);
});


/* ============================== PHÍM TẮT ============================== */
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        // Tìm sẵn có của trình duyệt không mở được mục đang gấp -> dùng ô tìm của trang
        e.preventDefault();
        return openSearch();
    }
    if (e.key === 'Escape') { closeSheets(); closePresent(); closeBox(); closeSearch(); }
    if (!present.hidden) {
        if (e.key === 'ArrowRight') stepPresent(1);
        if (e.key === 'ArrowLeft') stepPresent(-1);
    }
    if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); openSearch(); }
});


/* ============================== VẠCH TIẾN ĐỘ ĐỌC ============================== */
const readBar = $('read-bar');
addEventListener('scroll', () => {
    const d = document.documentElement;
    const max = d.scrollHeight - d.clientHeight;
    readBar.style.width = (max > 4 ? d.scrollTop / max * 100 : 0) + '%';
}, { passive: true });


/* ============================== XEM ẢNH TO ============================== */
const lightbox = $('lightbox');
const closeBox = () => { lightbox.hidden = true; };
document.addEventListener('click', (e) => {
    const img = e.target.closest('.cls-img');
    if (!img) return;
    e.preventDefault();
    lightbox.querySelector('img').src = img.src;
    lightbox.querySelector('.lightbox-cap').textContent =
        img.closest('.cls-fig')?.querySelector('figcaption')?.textContent || '';
    lightbox.hidden = false;
});
lightbox.addEventListener('click', closeBox);
