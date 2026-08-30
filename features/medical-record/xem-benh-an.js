import { showToast } from '../../core/utils.js';
import { getRecord, syncFromCloud, authReady, isSignedIn } from './record-store.js';
import { auth } from '../../core/firebase-init.js';
import { clsToHtml, clsToWordHtml } from './cls-shared.js';
import { buildModel, VITAL_RANGE, toMarkdown, slugName, downloadMarkdown } from './benh-an-text.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const recordId = new URL(location.href).searchParams.get('id');


/* ---------- render ---------- */
function vitalsHtml(items, caption) {
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
    if (!chips) return '';
    return (caption ? `<div class="text-xs font-semibold text-pink-500 mt-1">${esc(caption)}</div>` : '')
        + `<div class="flex flex-wrap gap-2 mb-1">${chips}</div>`;
}

/** Ảnh lâm sàng / ảnh hồ sơ — dùng lại class của phiếu CLS nên bấm vào cũng phóng to được */
function anhHtml(list, caption) {
    const imgs = (list || []).filter(im => im && im.url).map(im => `<figure class="cls-fig">
        <img class="cls-img" src="${esc(im.url)}" alt="${esc(im.caption || caption)}" loading="lazy">
        ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    if (!imgs) return '';
    return `<div class="text-xs font-semibold text-pink-500 mt-1">${esc(caption)}</div>`
        + `<div class="cls-imgs">${imgs}</div>`;
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
    const body = rows.map(([label, value, extra]) =>
        label === '@vitals' ? vitalsHtml(value, extra)
            : label === '@cls' ? clsToHtml(value)
                : label === '@anh' ? anhHtml(value, extra)
                    : fieldHtml(label, value)).join('');
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

    const actions = {
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
        }
    };

    ['print', 'copy', 'txt', 'word', 'share'].forEach(act => {
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

/* Ảnh cận lâm sàng: bấm để xem to, phóng to bằng cử chỉ sẵn có của trình duyệt */
const lightbox = document.createElement('div');
lightbox.className = 'lightbox hidden no-print';
lightbox.innerHTML = `<button class="lightbox-x" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
    <img alt="Ảnh cận lâm sàng"><p class="lightbox-cap"></p>`;
document.body.appendChild(lightbox);

const closeBox = () => lightbox.classList.add('hidden');
view.addEventListener('click', (e) => {
    const img = e.target.closest('.cls-img');
    if (!img) return;
    e.preventDefault();
    lightbox.querySelector('img').src = img.src;
    lightbox.querySelector('.lightbox-cap').textContent =
        img.closest('.cls-fig')?.querySelector('figcaption')?.textContent || '';
    lightbox.classList.remove('hidden');
});
lightbox.addEventListener('click', closeBox);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBox(); });
