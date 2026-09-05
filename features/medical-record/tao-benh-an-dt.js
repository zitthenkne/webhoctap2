/* =====================================================================
   tao-benh-an-dt.js — MƯỜI NÂNG CẤP RIÊNG CHO ĐIỆN THOẠI

   Vì sao tách file: tao-benh-an.js giữ mạch lưu/xuất bản, tao-benh-an-them.js
   giữ lối tắt giao diện, nhap-lien-ket.js giữ nhập nhanh & liên kết. File này
   CHỈ đọc DOM có sẵn và đổ chữ vào ô đã có — không thêm ô nội dung nào, không
   đụng FIELDS / buildModel, nên không sinh cạnh mới trong codegraph.

   Mọi thứ ở đây chỉ bật khi màn hình ≤640px (điện thoại). Máy tính không đổi.

   1. Chip gợi ý của chính ô đang gõ LEO LÊN trên bàn phím — trước đây hàng chip
      nằm dưới ô nên bàn phím ảo che mất, "chạm là điền" thành vô dụng lúc gõ.
   2. Nút ▲ ▼ chuyển ô + nút nhảy ô trống ngay trên bàn phím: đi hết bệnh án
      không phải đóng bàn phím lần nào.
   3. Ô đang gõ luôn nổi trên bàn phím (dò visualViewport, tự cuộn bù).
   4. Ô dài (bệnh sử, biện luận) mở được TOÀN MÀN HÌNH, kèm micro + chip gợi ý.
   5. "Đọc để điền": nói cả đoạn → máy tách vào nhiều ô, tick rồi điền
      (mượn nguyên bảng "Dán thông tin" đã có của nhap-lien-ket.js).
   6. <select> ngắn → hàng chip một chạm (bỏ hẳn thao tác mở bảng chọn của máy).
   7. "Chỉ hiện ô còn trống": giấu ô đã điền, màn hình chỉ còn việc chưa làm.
   8. Ô ngày/giờ có chip Hôm nay · Hôm qua · Bây giờ… — khỏi vật lộn với lịch.
   9. "Về chỗ đang gõ": mở lại bệnh án là có nút nhảy thẳng về ô bỏ dở.
  10. Cuộn xuống thì dải chip mục tự thu lại, trả màn hình cho ô nhập.
  (+) Rời ô là tự dọn khoảng trắng thừa và viết hoa đầu câu.
   ===================================================================== */

import { showToast } from '../../core/utils.js';
import { goTo, labelOf } from './tao-benh-an-them.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mq = matchMedia('(max-width: 640px)');
const isPhone = () => mq.matches;

/* Ô "thật" của bệnh án — bỏ ô cài đặt phiên và thanh nút */
const FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select';
const isField = (el) => el?.matches?.(FIELD_SEL) && !el.closest('#ba-settings')
    && !el.closest('.sticky-actions') && !el.disabled && !el.readOnly;

const fieldList = () => [...form.querySelectorAll(FIELD_SEL)]
    .filter(f => isField(f) && f.offsetParent !== null && !f.closest('[data-nocount]'));

/** Ghi vào ô y như người gõ: tự lưu, MIRRORS, thanh phần trăm đều chạy theo */
function setVal(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Hàng chip gợi ý của một ô (goi-y-nhap.js gắn ngay sau ô), hoặc hàng chip của
    <select> do chính file này dựng ở mục 6 */
const chipsOf = (el) => {
    const n = el?.nextElementSibling;
    return n && (n.classList.contains('chips') || n.classList.contains('dt-sel')) ? n : null;
};

if (form) initPhone();

function initPhone() {

    const syncMode = () => document.body.classList.toggle('dt-on', isPhone());
    syncMode();
    mq.addEventListener('change', () => { syncMode(); if (isPhone()) buildOnce(); });

    /* =================================================================
       0. ĐỌC CHÍNH TẢ dùng chung cho mục 4 và 5
       Web Speech có sẵn trong Chrome/Edge — không thêm thư viện nào.
       ================================================================= */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const LENH = [
        [/\bxu[oố]ng d[òo]ng\b/gi, '\n'],
        [/\bd[ấa]u ch[ấa]m ph[ẩa]y\b/gi, '; '],
        [/\bd[ấa]u ch[ấa]m\b/gi, '. '],
        [/\bd[ấa]u ph[ẩa]y\b/gi, ', '],
        [/\bd[ấa]u hai ch[ấa]m\b/gi, ': ']
    ];
    const cleanSpeech = (s) => LENH.reduce((t, [re, r]) => t.replace(re, r), ' ' + s.trim())
        .replace(/\s+([.,;:])/g, '$1').trim();

    let rec = null;
    /** dictate(onText, btn) — bấm lần nữa là dừng */
    function dictate(onText, btn) {
        if (!SR) return showToast('Máy này chưa đọc chính tả được — mở bằng Chrome hoặc Edge.', 'warning');
        if (rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = 'vi-VN';
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (ev) => {
            let add = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++)
                if (ev.results[i].isFinal) add += ev.results[i][0].transcript;
            if (add) onText(cleanSpeech(add));
        };
        rec.onerror = (ev) => {
            if (ev.error !== 'aborted' && ev.error !== 'no-speech')
                showToast('Không nghe được (' + ev.error + ').', 'error');
        };
        rec.onend = () => { rec = null; btn?.classList.remove('is-on'); };
        try { rec.start(); } catch { rec = null; return; }
        btn?.classList.add('is-on');
        showToast('Đang nghe… nói "dấu chấm", "xuống dòng" để đặt dấu câu. Bấm lại để dừng.', 'info', 3500);
    }

    /* =================================================================
       1 + 2. THANH BÀN PHÍM: chip gợi ý của ô + điều hướng ô
       Đứng NGAY TRÊN thanh trợ nhập của nhap-lien-ket.js (micro, @, gõ tắt)
       nên hai thanh không tranh chỗ; vị trí lấy theo hình chữ nhật thật của
       thanh kia chứ không đoán, vì nó tự bám bàn phím bằng visualViewport.
       ================================================================= */
    const kbar = document.createElement('div');
    kbar.className = 'dt-kb hidden';
    kbar.setAttribute('role', 'toolbar');
    kbar.setAttribute('aria-label', 'Gợi ý cho ô đang gõ');
    document.body.appendChild(kbar);
    // Bấm nút trên thanh không được cướp con trỏ khỏi ô đang gõ
    kbar.addEventListener('mousedown', (e) => e.preventDefault());

    let cur = null;
    const vv = window.visualViewport;

    function renderKbar() {
        const el = cur;
        if (!el) return;
        const chips = chipsOf(el);
        const list = chips ? [...chips.querySelectorAll('.chip')] : [];
        const nav = '<button type="button" class="dt-k-nav" data-k="prev" aria-label="Ô trước"><i class="fas fa-chevron-up"></i></button>'
            + '<button type="button" class="dt-k-nav" data-k="next" aria-label="Ô kế"><i class="fas fa-chevron-down"></i></button>'
            + '<button type="button" class="dt-k-nav" data-k="gap" aria-label="Ô còn trống"><i class="fas fa-location-crosshairs"></i></button>'
            + (el.tagName === 'TEXTAREA'
                ? '<button type="button" class="dt-k-nav is-key" data-k="full" aria-label="Mở rộng ô"><i class="fas fa-up-right-and-down-left-from-center"></i></button>' : '');
        /* Ô không có chip gợi ý thì thanh co lại còn mấy nút mũi tên: thanh trợ
           nhập ngay dưới đã ghi tên ô rồi, ghi lại lần nữa là hai dòng chữ giống
           hệt nhau nằm chồng lên nhau. */
        kbar.classList.toggle('is-bare', !list.length);
        const row = list.map((b, i) =>
            `<button type="button" class="dt-k-chip${b.classList.contains('is-on') ? ' is-on' : ''}" data-i="${i}">${esc(b.textContent.trim())}</button>`).join('');
        kbar.innerHTML = `<div class="dt-k-fix">${nav}</div>`
            + (list.length ? `<div class="dt-k-row">${row}</div>` : '');
    }

    /* Thanh trợ nhập kia đặt bottom bằng JS mỗi khi bàn phím đổi cỡ; đo lại từ
       nó là cách duy nhất chắc chắn hai thanh không chồng lên nhau. */
    function place() {
        if (kbar.classList.contains('hidden')) return;
        const a = document.querySelector('.nl-assist:not(.hidden)');
        if (a) {
            const t = a.getBoundingClientRect().top;
            if (t > 0) { kbar.style.bottom = Math.round(innerHeight - t + 6) + 'px'; return; }
        }
        const kb = vv ? Math.max(0, innerHeight - (vv.height + vv.offsetTop)) : 0;
        kbar.style.bottom = kb > 40 ? (kb + 8) + 'px' : '';
    }
    const replace = () => { place(); requestAnimationFrame(place); setTimeout(place, 140); };

    /* -------- 3. Ô đang gõ không bị bàn phím che -------- */
    let visT = 0;
    function ensureVisible() {
        clearTimeout(visT);
        visT = setTimeout(() => {
            if (!cur || !isPhone()) return;
            const barTop = kbar.classList.contains('hidden') ? innerHeight : kbar.getBoundingClientRect().top;
            const r = cur.getBoundingClientRect();
            /* Ô nhiều dòng tự cao có thể cao hơn cả màn hình: chỉ cần thấy phần
               đầu ô là đủ, không thì cuộn bù đẩy luôn cái ô ra khỏi màn. */
            const bottom = Math.min(r.bottom, r.top + 150);
            const TOP_SAFE = 64;             // chừa dải chip mục dính trên đầu
            let d = 0;
            if (bottom > barTop - 10) d = bottom - barTop + 16;
            else if (r.top < TOP_SAFE) d = r.top - TOP_SAFE;
            if (Math.abs(d) > 6) scrollBy({ top: d, behavior: 'smooth' });
        }, 280);
    }

    function showKbar(el) {
        cur = el;
        renderKbar();
        kbar.classList.remove('hidden');
        replace();
        ensureVisible();
    }
    function hideKbar() {
        cur = null;
        kbar.classList.add('hidden');
        kbar.style.bottom = '';
    }

    form.addEventListener('focusin', (e) => {
        if (!isPhone()) return;
        const el = e.target;
        if (!isField(el)) return hideKbar();
        showKbar(el);
        remember(el);
    });
    form.addEventListener('focusout', () => setTimeout(() => {
        const a = document.activeElement;
        if (!a || !form.contains(a) || !isField(a)) hideKbar();
    }, 150));

    // Ô đổi giá trị thì trạng thái chip (is-on) đổi theo
    form.addEventListener('input', (e) => {
        if (cur && e.target === cur && chipsOf(cur)) setTimeout(renderKbar, 0);
    });

    vv?.addEventListener('resize', () => { replace(); ensureVisible(); });
    vv?.addEventListener('scroll', replace);

    kbar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || !cur) return;
        if (b.dataset.i != null) {
            chipsOf(cur)?.querySelectorAll('.chip')[+b.dataset.i]?.click();
            navigator.vibrate?.(6);
            return setTimeout(renderKbar, 0);
        }
        const k = b.dataset.k;
        if (k === 'full') return openFull(cur);
        if (k === 'gap') return $('ba-gap')?.click();
        const list = fieldList();
        const nx = list[list.indexOf(cur) + (k === 'next' ? 1 : -1)];
        if (!nx) return showToast(k === 'next' ? 'Đã tới ô cuối của mục.' : 'Đang ở ô đầu.', 'info', 1400);
        nx.focus({ preventScroll: true });
        navigator.vibrate?.(6);
    });

    /* =================================================================
       4. MỞ RỘNG Ô THÀNH TOÀN MÀN HÌNH
       Ô bệnh sử / biện luận trên điện thoại chỉ thấy 3-4 dòng, viết một đoạn
       dài là mất dấu. Mở rộng ra: cả màn hình là ô, kèm micro và chip gợi ý.
       ================================================================= */
    let full = null, fullEl = null;

    function buildFull() {
        full = document.createElement('div');
        full.className = 'dt-full hidden';
        full.innerHTML = `
            <div class="dt-f-head">
                <button type="button" class="dt-f-x" data-f="close" aria-label="Đóng"><i class="fas fa-chevron-down"></i></button>
                <b class="dt-f-lab"></b>
                <span class="dt-f-n"></span>
                <button type="button" class="dt-f-ok" data-f="close"><i class="fas fa-check"></i> Xong</button>
            </div>
            <textarea class="dt-f-ta" spellcheck="false"></textarea>
            <div class="dt-f-chips"></div>
            <div class="dt-f-foot">
                <button type="button" class="dt-f-btn dt-f-mic" data-f="mic"><i class="fas fa-microphone"></i> Đọc</button>
                <button type="button" class="dt-f-btn" data-f="nl"><i class="fas fa-turn-down"></i> Xuống dòng</button>
                <button type="button" class="dt-f-btn" data-f="clear"><i class="fas fa-eraser"></i> Xóa hết</button>
            </div>`;
        document.body.appendChild(full);

        const ta = full.querySelector('.dt-f-ta');
        ta.addEventListener('input', () => {
            if (!fullEl) return;
            fullEl.value = ta.value;
            fullEl.dispatchEvent(new Event('input', { bubbles: true }));
            full.querySelector('.dt-f-n').textContent = ta.value.trim() ? ta.value.trim().length + ' chữ' : '';
        });

        full.querySelector('.dt-f-chips').addEventListener('mousedown', (e) => e.preventDefault());
        full.querySelector('.dt-f-chips').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-i]');
            if (!b || !fullEl) return;
            chipsOf(fullEl)?.querySelectorAll('.chip')[+b.dataset.i]?.click();
            ta.value = fullEl.value;             // chip ghi thẳng vào ô gốc, kéo về đây
            renderFullChips();
            navigator.vibrate?.(6);
        });

        full.addEventListener('click', (e) => {
            const b = e.target.closest('[data-f]');
            if (!b) return;
            const k = b.dataset.f;
            if (k === 'close') return closeFull();
            if (k === 'mic') return dictate((t) => {
                const v = ta.value;
                ta.value = v && !/\s$/.test(v) ? v + ' ' + t : v + t;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            }, b);
            if (k === 'nl') { ta.value += '\n'; ta.dispatchEvent(new Event('input', { bubbles: true })); return ta.focus(); }
            if (k === 'clear') {
                if (!ta.value || !confirm('Xóa hết chữ trong ô này?')) return;
                ta.value = '';
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    function renderFullChips() {
        const host = full.querySelector('.dt-f-chips');
        const chips = fullEl ? chipsOf(fullEl) : null;
        const list = chips ? [...chips.querySelectorAll('.chip')] : [];
        host.innerHTML = list.map((b, i) =>
            `<button type="button" class="dt-k-chip${b.classList.contains('is-on') ? ' is-on' : ''}" data-i="${i}">${esc(b.textContent.trim())}</button>`).join('');
        host.classList.toggle('hidden', !list.length);
    }

    function openFull(el) {
        if (!full) buildFull();
        fullEl = el;
        full.querySelector('.dt-f-lab').textContent = String(labelOf(el) || 'Ô nhập').slice(0, 42);
        const ta = full.querySelector('.dt-f-ta');
        ta.value = el.value || '';
        full.querySelector('.dt-f-n').textContent = ta.value.trim() ? ta.value.trim().length + ' chữ' : '';
        renderFullChips();
        full.classList.remove('hidden');
        document.body.classList.add('dt-full-on');
        hideKbar();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    function closeFull() {
        if (rec) rec.stop();
        full.classList.add('hidden');
        document.body.classList.remove('dt-full-on');
        const el = fullEl;
        fullEl = null;
        if (!el) return;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        goTo(el);
    }

    addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && full && !full.classList.contains('hidden')) closeFull();
    });

    /* =================================================================
       5. ĐỌC CẢ ĐOẠN → TỰ CHIA VÀO NHIỀU Ô
       Không viết lại bộ tách chữ: mở đúng bảng "Dán thông tin" của
       nhap-lien-ket.js rồi đọc thẳng vào ô dán, bảng đó tự chỉ ra sẽ điền
       ô nào để mình tick.
       ================================================================= */
    function sayToFill() {
        const open = $('ba-paste');
        if (!open) return showToast('Chưa mở được bảng điền nhanh.', 'error');
        open.click();
        setTimeout(() => {
            const ta = $('nl-paste-in');
            if (!ta) return;
            ta.placeholder = 'Bấm "Đọc" rồi nói: họ tên Nguyễn Văn A, 62 tuổi, giới nam, '
                + 'chẩn đoán viêm phổi, mạch 96, huyết áp 120/80, nhiệt độ 38,5';
            let mic = document.getElementById('dt-say-mic');
            if (!mic) {
                mic = document.createElement('button');
                mic.type = 'button';
                mic.id = 'dt-say-mic';
                mic.className = 'nl-ok dt-say-mic';
                mic.innerHTML = '<i class="fas fa-microphone"></i> Đọc';
                $('nl-paste-ok')?.before(mic);
                mic.addEventListener('click', () => dictate((t) => {
                    ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n') : '') + t;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }, mic));
            }
            mic.click();
        }, 160);
    }

    /* =================================================================
       6. <select> NGẮN → HÀNG CHIP MỘT CHẠM
       Bảng chọn của máy trên điện thoại tốn ba thao tác (mở · cuộn · chọn) cho
       một câu Có/Không. Ô nào ít lựa chọn và chữ ngắn thì bày thẳng ra thành
       chip. <select> vẫn nằm nguyên tại chỗ (chỉ co lại) để nó vẫn là nguồn
       dữ liệu duy nhất, và nút "nhảy tới ô trống" vẫn cuộn đúng chỗ.
       ================================================================= */
    function chipifySelects() {
        form.querySelectorAll('select').forEach((sel) => {
            if (sel.dataset.dtChip || sel.multiple || sel.closest('#ba-settings')) return;
            const opts = [...sel.options].filter(o => o.value !== '' && o.text.trim());
            if (!opts.length || opts.length > 4 || opts.some(o => o.text.trim().length > 18)) return;
            sel.dataset.dtChip = '1';

            const wrap = document.createElement('div');
            wrap.className = 'chips dt-sel';
            wrap.innerHTML = opts.map(o =>
                `<button type="button" class="chip" data-v="${esc(o.value)}">${esc(o.text.trim())}</button>`).join('')
                + '<button type="button" class="chip dt-sel-x" data-v="" aria-label="Bỏ chọn">✕</button>';
            sel.insertAdjacentElement('afterend', wrap);

            const mark = () => wrap.querySelectorAll('.chip').forEach(b =>
                b.classList.toggle('is-on', b.dataset.v !== '' && b.dataset.v === sel.value));
            wrap.addEventListener('click', (e) => {
                const b = e.target.closest('.chip');
                if (!b) return;
                /* Nút nằm trong <label> bọc <select>: chặn để cú chạm không bị
                   nhãn chuyển tiếp thành "mở bảng chọn của máy". */
                e.preventDefault();
                setVal(sel, b.dataset.v === sel.value ? '' : b.dataset.v);
                mark();
                navigator.vibrate?.(6);
            });
            sel.addEventListener('change', mark);
            mark();
        });
    }

    /* =================================================================
       7. CHỈ HIỆN Ô CÒN TRỐNG
       Giấu hẳn khối đã điền xong. Bệnh án này dài cỡ 300 ô, cuối buổi chỉ còn
       vài chỗ trống mà vẫn phải cuộn qua hết — bật cái này là màn hình chỉ còn
       việc chưa làm.
       ================================================================= */
    const countable = () => [...form.querySelectorAll(FIELD_SEL)]
        .filter(f => isField(f) && !f.closest('[data-nocount]') && !f.closest('.bl-raw'));

    function markDone() {
        form.querySelectorAll('.dt-done').forEach(n => n.classList.remove('dt-done'));
        if (!document.body.classList.contains('dt-gaps')) return;
        const all = countable();
        const seen = new Set(all);
        const empty = new Set(all.filter(f => !String(f.value || '').trim()));
        const boxes = new Set();
        all.forEach(f => {
            const w = f.closest('label') || f.parentElement;
            if (w && w !== form && !w.classList.contains('tab-content')) boxes.add(w);
            const fs = f.closest('fieldset');
            if (fs) boxes.add(fs);
        });
        boxes.forEach(b => {
            const inside = [...b.querySelectorAll(FIELD_SEL)].filter(f => seen.has(f));
            if (inside.length && !inside.some(f => empty.has(f))) b.classList.add('dt-done');
        });
    }

    function toggleGaps() {
        const on = !document.body.classList.contains('dt-gaps');
        document.body.classList.toggle('dt-gaps', on);
        $('dt-gaps')?.classList.toggle('is-on', on);
        markDone();
        showToast(on ? 'Chỉ còn hiện ô chưa điền — bấm lại để hiện hết.' : 'Hiện lại tất cả các ô.', 'info', 2200);
    }
    let doneT = 0;
    form.addEventListener('input', () => {
        if (!document.body.classList.contains('dt-gaps')) return;
        clearTimeout(doneT);
        doneT = setTimeout(markDone, 900);
    });

    /* =================================================================
       8. Ô NGÀY / GIỜ MỘT CHẠM
       Lịch của máy trên điện thoại phải chạm 4-5 lần cho một ngày trong tuần
       vừa rồi. Ngày khởi phát, ngày khám… gần như luôn là hôm nay hoặc vài
       ngày trước, nên bày sẵn.
       ================================================================= */
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const backDays = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    const DAY_CHIPS = [['Hôm nay', () => backDays(0)], ['Hôm qua', () => backDays(1)],
    ['3 ngày trước', () => backDays(3)], ['1 tuần trước', () => backDays(7)]];
    const TIME_CHIPS = [['Bây giờ', () => new Date().toTimeString().slice(0, 5)],
    ['07:00', () => '07:00'], ['14:00', () => '14:00'], ['20:00', () => '20:00']];
    /* Ô "ngày giờ" (giờ làm bệnh án, giờ tai nạn, giờ mổ…) gõ tay tốn nhiều
       chạm nhất trang: 5 lần cho một mốc gần như luôn là "vừa nãy". */
    const backHours = (h) => () => {
        const d = new Date(Date.now() - h * 36e5);
        return `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const DT_CHIPS = [['Bây giờ', backHours(0)], ['1 giờ trước', backHours(1)],
    ['3 giờ trước', backHours(3)], ['Hôm qua giờ này', backHours(24)]];

    function whenChips() {
        form.querySelectorAll('input[type=date], input[type=time], input[type=datetime-local]').forEach((el) => {
            if (el.dataset.dtWhen || chipsOf(el) || el.closest('#ba-settings')) return;
            el.dataset.dtWhen = '1';
            const items = el.type === 'date' ? DAY_CHIPS : el.type === 'time' ? TIME_CHIPS : DT_CHIPS;
            const wrap = document.createElement('div');
            wrap.className = 'chips compact dt-when';
            wrap.innerHTML = items.map(([t], i) => `<button type="button" class="chip" data-i="${i}">${esc(t)}</button>`).join('');
            wrap.addEventListener('mousedown', (e) => e.preventDefault());
            wrap.addEventListener('click', (e) => {
                const b = e.target.closest('.chip');
                if (!b) return;
                e.preventDefault();
                setVal(el, items[+b.dataset.i][1]());
                navigator.vibrate?.(6);
            });
            el.insertAdjacentElement('afterend', wrap);
        });
    }

    /* =================================================================
       9. VỀ CHỖ ĐANG GÕ
       Viết bệnh án trên điện thoại hay bị đứt quãng (đi buồng, hết pin, chuyển
       app). Mở lại là nhảy đúng về ô bỏ dở, không phải cuộn tìm.
       ================================================================= */
    const LAST = 'baLastField';
    let rmT = 0;
    function remember(el) {
        if (!el.id) return;
        clearTimeout(rmT);
        rmT = setTimeout(() => {
            try { localStorage.setItem(LAST, JSON.stringify({ id: el.id, t: Date.now() })); } catch { }
        }, 400);
    }

    function offerResume() {
        if (!isPhone()) return;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { }
        if (!s?.id || Date.now() - s.t > 7 * 864e5) return;
        const el = $(s.id);
        if (!el || !isField(el)) return;
        // Bệnh án trắng tinh thì lời mời vô nghĩa
        if (!countable().some(f => String(f.value || '').trim())) return;

        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'dt-resume';
        pill.innerHTML = `<i class="fas fa-clock-rotate-left"></i> Về chỗ đang gõ: <b>${esc(String(labelOf(el) || '').slice(0, 26))}</b>`;
        document.body.appendChild(pill);
        const kill = () => pill.remove();
        pill.addEventListener('click', () => { kill(); goTo(el); });
        setTimeout(kill, 9000);
    }

    /* =================================================================
       10. CUỘN XUỐNG → THU DẢI CHIP MỤC
       Dải chip mục dính trên đầu ăn ~46px. Lúc đang gõ thì cần màn hình hơn
       cần thanh điều hướng; cuộn ngược lên là nó về ngay.
       ================================================================= */
    let lastY = scrollY, hidTop = false;
    addEventListener('scroll', () => {
        if (!isPhone()) return;
        const y = scrollY, d = y - lastY;
        if (Math.abs(d) < 8) return;
        lastY = y;
        const want = d > 0 && y > 220;
        if (want === hidTop) return;
        hidTop = want;
        document.body.classList.toggle('dt-hide-top', want);
    }, { passive: true });

    /* =================================================================
       (+) RỜI Ô LÀ TỰ DỌN CHỮ
       Gõ trên điện thoại hay dính khoảng trắng thừa ở đầu/cuối và quên viết
       hoa. Chỉ chạy lúc rời ô, không đụng vào lúc đang gõ.
       ================================================================= */
    form.addEventListener('change', (e) => {
        const el = e.target;
        if (!isPhone() || !el.matches('input[type=text], input:not([type]), textarea')
            || el.closest('#ba-settings') || !el.value) return;
        const v = el.value;
        let t = v.replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').trim();
        if (t && /\p{Ll}/u.test(t[0])) t = t[0].toLocaleUpperCase('vi') + t.slice(1);
        if (t === v) return;
        el.value = t;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    /* =================================================================
       GẮN VÀO KHAY CÔNG CỤ CÓ SẴN
       ================================================================= */
    const tools = $('ba-tools');
    if (tools) {
        tools.insertAdjacentHTML('beforeend',
            '<button type="button" class="ba-tool dt-only" id="dt-say"><i class="fas fa-microphone-lines"></i> Đọc để điền</button>'
            + '<button type="button" class="ba-tool dt-only" id="dt-gaps"><i class="fas fa-filter"></i> Chỉ ô còn trống</button>');
        $('dt-say').addEventListener('click', sayToFill);
        $('dt-gaps').addEventListener('click', toggleGaps);
    }

    /* Chip cho <select> và ô ngày/giờ phải dựng lại sau khi trang bày thêm ô
       (đổi loại bệnh án, mở mục mới, thêm dòng theo dõi…). */
    function buildOnce() {
        if (!isPhone()) return;
        chipifySelects();
        whenChips();
    }
    const boot = () => { buildOnce(); offerResume(); };
    setTimeout(boot, 900);
    setTimeout(buildOnce, 2500);
    document.querySelectorAll('.tab-link').forEach(l =>
        l.addEventListener('click', () => setTimeout(buildOnce, 350)));
    $('type-chips')?.addEventListener('click', () => setTimeout(buildOnce, 350));
}
