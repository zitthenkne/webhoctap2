/* =====================================================================
   tao-benh-an-tungcau.js — BỎ HẲN VIỆC CUỘN BIỂU MẪU TRÊN ĐIỆN THOẠI

   Vì sao có file này: kể cả sau khi đã gọn hết mức, một mục của bệnh án vẫn
   là 20-40 ô xếp dọc trên màn hình 6 inch. Thao tác thật của sinh viên là
   "cuộn — tìm ô — chạm — gõ — cuộn tiếp", trong đó ba việc đầu chẳng tạo ra
   chữ nào. Hai chế độ dưới đây cắt hẳn ba việc đó:

     1. TỪNG CÂU MỘT — mỗi màn hình một ô: tên ô to, gợi ý bày sẵn thành nút
        lớn, micro ngay đó, chạm "Tiếp" là sang ô sau. Không cuộn, không tìm.
     2. BÀN PHÍM SINH HIỆU — 7 ô sinh hiệu trong MỘT màn: chọn ô bằng chip,
        gõ bằng phím số cỡ ngón tay (có cả "/" cho huyết áp và dấu phẩy thập
        phân), khỏi đổi qua lại giữa bàn phím chữ và số.
     3. NÚT CÁI — nút nổi trong tầm ngón cái, hiện luôn "còn mấy ô trống" của
        mục đang mở, chạm là vào chế độ Từng câu.

   File này KHÔNG thêm ô nội dung nào: nó chỉ dựng ô-đại-diện rồi ghi ngược
   vào ô thật bằng `input`/`change` y như người gõ, nên tự lưu, thanh phần
   trăm, MIRRORS, bộ soi logic đều chạy như thường.
   Chỉ bật ở màn hình ≤640px.
   ===================================================================== */

import { showToast } from '../../core/utils.js';
import { labelOf } from './tao-benh-an-them.js';

const $ = (id) => document.getElementById(id);
const form = $('medical-record-form');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mq = matchMedia('(max-width: 640px)');
const isPhone = () => mq.matches;

if (form) init();

function init() {

    const setVal = (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /* Hàng chip gợi ý và nút "chọn từ danh mục" của một ô — goi-y-nhap.js gắn
       chúng ngay sau ô (chip trước, nút chọn sau). Chế độ Từng câu KHÔNG dựng
       lại logic của chúng: nó nhân bản nút rồi chuyển tiếp cú chạm về bản gốc. */
    const chipsOf = (el) => {
        const n = el?.nextElementSibling;
        return n && (n.classList.contains('chips') || n.classList.contains('dt-sel')) ? n : null;
    };
    const pickOf = (el) => {
        let n = el?.nextElementSibling;
        for (let i = 0; i < 3 && n; i++, n = n.nextElementSibling)
            if (n.classList?.contains('pick-btn')) return n;
        return null;
    };

    const FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select';
    const isOpen = (f) => !f.disabled && !f.readOnly && f.offsetParent !== null
        && !f.closest('#ba-settings') && !f.closest('[data-nocount]') && !f.closest('.bl-raw');

    /** Các ô của MỤC ĐANG MỞ, đúng thứ tự nhìn thấy. Ô đang nằm trong khối gấp
        thì không tính — người dùng đã chủ động gấp nó lại. */
    const walkFields = () => {
        const pane = form.querySelector('.tab-content.active') || form;
        return [...pane.querySelectorAll(FIELD_SEL)].filter(isOpen);
    };
    const secName = () => document.querySelector('.tab-link.active .tab-text')?.textContent.trim() || 'Bệnh án';

    /* =================================================================
       ĐỌC CHÍNH TẢ (dùng cho cả hai chế độ)
       ================================================================= */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const LENH = [
        [/\bxu[oố]ng d[òo]ng\b/gi, '\n'],
        [/\bd[ấa]u ch[ấa]m ph[ẩa]y\b/gi, '; '],
        [/\bd[ấa]u ch[ấa]m\b/gi, '. '],
        [/\bd[ấa]u ph[ẩa]y\b/gi, ', '],
        [/\bd[ấa]u hai ch[ấa]m\b/gi, ': ']
    ];
    const clean = (s) => LENH.reduce((t, [re, r]) => t.replace(re, r), ' ' + s.trim())
        .replace(/\s+([.,;:])/g, '$1').trim();

    let rec = null;
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
            if (add) onText(clean(add));
        };
        rec.onerror = (ev) => {
            if (ev.error !== 'aborted' && ev.error !== 'no-speech')
                showToast('Không nghe được (' + ev.error + ').', 'error');
        };
        rec.onend = () => { rec = null; btn?.classList.remove('is-on'); };
        try { rec.start(); } catch { rec = null; return; }
        btn?.classList.add('is-on');
        showToast('Đang nghe… nói "dấu chấm", "xuống dòng" để đặt dấu câu.', 'info', 3000);
    }
    const stopMic = () => { if (rec) rec.stop(); };

    /* =================================================================
       1. TỪNG CÂU MỘT
       ================================================================= */
    let pv = null, list = [], at = 0;

    function build() {
        pv = document.createElement('div');
        pv.className = 'pv hidden';
        pv.innerHTML = `
            <div class="pv-top">
                <button type="button" class="pv-x" data-p="close" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
                <div class="pv-bar"><i></i></div>
                <span class="pv-n"></span>
            </div>
            <div class="pv-body"></div>
            <div class="pv-foot">
                <button type="button" class="pv-b" data-p="prev" aria-label="Ô trước"><i class="fas fa-arrow-left"></i></button>
                <button type="button" class="pv-b pv-mic" data-p="mic"><i class="fas fa-microphone"></i> Đọc</button>
                <button type="button" class="pv-b is-key" data-p="next">Tiếp <i class="fas fa-arrow-right"></i></button>
            </div>`;
        document.body.appendChild(pv);

        pv.addEventListener('click', (e) => {
            const b = e.target.closest('[data-p]');
            if (!b) return;
            const k = b.dataset.p;
            if (k === 'close') return close();
            if (k === 'prev') return go(-1);
            if (k === 'next') return go(1);
            if (k === 'mic') return micHere(b);
            if (k === 'vitals') { close(); return openPad(); }
            if (k === 'nextsec') return nextSection();
        });

        /* Vuốt ngang để sang ô kế — nhanh hơn với tay xuống nút. Không cướp cú
           vuốt của ô đang gõ hay của dải chip trượt ngang. */
        let sx = 0, sy = 0, on = false;
        pv.addEventListener('touchstart', (e) => {
            on = e.touches.length === 1 && !e.target.closest('input, textarea, button, .pv-chips, .pv-opts');
            if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
        }, { passive: true });
        pv.addEventListener('touchend', (e) => {
            if (!on) return;
            on = false;
            const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
            go(dx < 0 ? 1 : -1);
        }, { passive: true });
    }

    /** Ô-đại-diện: gõ ở đây thì ghi thẳng sang ô thật. Không bê ô thật vào đây
        vì nó phải nằm nguyên chỗ cũ (chip, nút chọn, bộ soi logic đều dò theo
        hàng xóm của nó trong DOM). */
    function proxyFor(el) {
        if (el.tagName === 'SELECT') {
            const box = document.createElement('div');
            box.className = 'pv-opts';
            [...el.options].filter(o => o.value !== '').forEach(o => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pv-opt' + (o.value === el.value ? ' is-on' : '');
                b.textContent = o.text.trim();
                b.addEventListener('click', () => {
                    setVal(el, o.value);
                    box.querySelectorAll('.pv-opt').forEach(x => x.classList.toggle('is-on', x === b));
                    navigator.vibrate?.(8);
                    setTimeout(() => go(1), 240);      // chọn xong là sang ô kế luôn
                });
                box.appendChild(b);
            });
            return box;
        }
        const p = document.createElement(el.tagName === 'TEXTAREA' ? 'textarea' : 'input');
        if (p.tagName === 'INPUT') {
            p.type = el.type || 'text';
            if (el.step) p.step = el.step;
            if (el.getAttribute('inputmode')) p.setAttribute('inputmode', el.getAttribute('inputmode'));
        } else p.rows = 6;
        p.className = 'pv-field';
        p.value = el.value || '';
        p.placeholder = el.placeholder || '';
        p.addEventListener('input', () => {
            el.value = p.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return p;
    }

    /* Dòng nhắc dưới tên ô. KHÔNG lấy placeholder: ô đại diện ngay bên dưới đã
       hiện đúng chữ đó rồi, in lại thành hai dòng giống hệt nhau. */
    const hintOf = (el) => {
        const box = el.closest('label, .calc-box, .hx-row');
        const q = box?.querySelector('.hx-ask, .bk-hint, .lb-sub');
        return (q?.textContent || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    };

    function render() {
        const body = pv.querySelector('.pv-body');
        stopMic();

        if (at >= list.length) return renderDone(body);

        const el = list[at];
        const done = list.filter(f => String(f.value || '').trim()).length;
        pv.querySelector('.pv-bar i').style.width = Math.round(done / list.length * 100) + '%';
        pv.querySelector('.pv-n').textContent = `${at + 1}/${list.length}`;
        pv.querySelector('.pv-foot').hidden = false;

        body.innerHTML = `
            <div class="pv-sec">${esc(secName())} · đã điền ${done}/${list.length}</div>
            <h3 class="pv-q">${esc(String(labelOf(el) || 'Ô nhập').slice(0, 90))}</h3>
            ${hintOf(el) ? `<p class="pv-hint">${esc(hintOf(el))}</p>` : ''}
            <div class="pv-in"></div>
            <div class="pv-chips"></div>
            <div class="pv-more"></div>`;

        body.querySelector('.pv-in').appendChild(proxyFor(el));

        // Chip gợi ý của chính ô đó, phóng to thành nút chạm được
        const src = chipsOf(el);
        const chips = src ? [...src.querySelectorAll('.chip')] : [];
        const host = body.querySelector('.pv-chips');
        host.innerHTML = chips.map((b, i) =>
            `<button type="button" class="pv-chip${b.classList.contains('is-on') ? ' is-on' : ''}" data-i="${i}">${esc(b.textContent.trim())}</button>`).join('');
        host.addEventListener('click', (e) => {
            const b = e.target.closest('[data-i]');
            if (!b) return;
            chipsOf(el)?.querySelectorAll('.chip')[+b.dataset.i]?.click();
            const p = body.querySelector('.pv-field');
            if (p) p.value = el.value;                 // chip ghi vào ô thật, kéo về ô đại diện
            b.classList.toggle('is-on');
            navigator.vibrate?.(6);
        });

        // Nút "chọn từ danh mục" và lối tắt bàn phím sinh hiệu
        const more = body.querySelector('.pv-more');
        const pick = pickOf(el);
        if (pick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pv-b';
            b.innerHTML = '<i class="fas fa-list-check"></i> ' + (pick.textContent.trim() || 'Chọn từ danh mục');
            b.addEventListener('click', () => pick.click());
            more.appendChild(b);
        }
        if (el.id?.startsWith('vital-')) more.insertAdjacentHTML('beforeend',
            '<button type="button" class="pv-b" data-p="vitals"><i class="fas fa-calculator"></i> Bàn phím sinh hiệu</button>');

        const f = body.querySelector('.pv-field');
        if (f) setTimeout(() => f.focus({ preventScroll: true }), 80);
    }

    function renderDone(body) {
        const left = list.filter(f => !String(f.value || '').trim()).length;
        pv.querySelector('.pv-bar i').style.width = '100%';
        pv.querySelector('.pv-n').textContent = '✓';
        pv.querySelector('.pv-foot').hidden = true;
        body.innerHTML = `
            <div class="pv-end">
                <i class="fas fa-circle-check"></i>
                <h3>Hết mục ${esc(secName())}</h3>
                <p>${left ? `Còn ${left} ô bỏ trống — bỏ trống cũng được, quay lại lúc nào cũng kịp.` : 'Cả mục đã kín.'}</p>
                <button type="button" class="pv-b is-key" data-p="nextsec">Sang mục kế <i class="fas fa-arrow-right"></i></button>
                <button type="button" class="pv-b" data-p="close">Đóng, xem lại cả mục</button>
            </div>`;
    }

    function go(d) {
        const n = at + d;
        if (n < 0) return;
        at = Math.min(n, list.length);
        render();
    }

    function micHere(btn) {
        const p = pv.querySelector('.pv-field');
        if (!p) return showToast('Ô này chọn bằng nút, không cần đọc.', 'info', 1800);
        dictate((t) => {
            p.value = p.value && !/\s$/.test(p.value) ? p.value + ' ' + t : p.value + t;
            p.dispatchEvent(new Event('input', { bubbles: true }));
        }, btn);
    }

    function nextSection() {
        const links = [...document.querySelectorAll('.tab-link')];
        const i = links.findIndex(l => l.classList.contains('active'));
        const nx = links[i + 1];
        if (!nx) { close(); return showToast('Đã là mục cuối của bệnh án.', 'success'); }
        close();
        nx.click();
        setTimeout(open, 420);
    }

    function open() {
        if (!isPhone()) return showToast('Chế độ Từng câu dành cho màn hình điện thoại.', 'info');
        if (!pv) build();
        list = walkFields();
        if (!list.length) return showToast('Mục này chưa có ô nào để điền.', 'warning');
        at = list.findIndex(f => !String(f.value || '').trim());
        if (at < 0) at = 0;
        pv.classList.remove('hidden');
        document.body.classList.add('pv-on');
        render();
    }

    function close() {
        stopMic();
        const el = list[at];
        pv.classList.add('hidden');
        document.body.classList.remove('pv-on');
        // Ô cuối cùng vừa gõ phải phát `change` để bản lưu khớp với màn hình
        el?.dispatchEvent(new Event('change', { bubbles: true }));
        el?.scrollIntoView({ block: 'center' });
    }

    /* =================================================================
       2. BÀN PHÍM SINH HIỆU
       ================================================================= */
    const VITALS = [
        ['vital-pulse', 'Mạch', 'l/p', '60–100'],
        ['vital-bp', 'Huyết áp', 'mmHg', '90/60 – 140/90'],
        ['vital-temp', 'Nhiệt độ', '°C', '36,5–37,5'],
        ['vital-resp', 'Nhịp thở', 'l/p', '16–20'],
        ['vital-spo2', 'SpO₂', '%', '≥ 95'],
        ['vital-weight', 'Cân nặng', 'kg', ''],
        ['vital-height', 'Chiều cao', 'cm', '']
    ];
    const KEYS = ['1', '2', '3', 'del', '4', '5', '6', '/', '7', '8', '9', ',', 'ok', '0', 'next'];
    let pad = null, vAt = 0;

    function buildPad() {
        pad = document.createElement('div');
        pad.className = 'pad hidden';
        pad.innerHTML = `
            <div class="pad-head">
                <button type="button" class="pv-x" data-k="close" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
                <b>Sinh hiệu</b>
                <span class="pad-note">gõ số cỡ ngón tay — khỏi đổi bàn phím</span>
            </div>
            <div class="pad-tabs"></div>
            <div class="pad-show"><b class="pad-val"></b><span class="pad-unit"></span><em class="pad-ref"></em></div>
            <div class="pad-keys">${KEYS.map(k => `<button type="button" class="pad-key${k === 'ok' ? ' is-ok' : ''}${k === 'next' ? ' is-key' : ''}" data-k="${k}">${
            k === 'del' ? '<i class="fas fa-delete-left"></i>' : k === 'ok' ? 'Xong'
                : k === 'next' ? 'Ô kế <i class="fas fa-arrow-right"></i>' : k === ',' ? ',' : k
            }</button>`).join('')}</div>`;
        document.body.appendChild(pad);

        pad.querySelector('.pad-tabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-i]');
            if (!b) return;
            vAt = +b.dataset.i;
            drawPad();
        });
        pad.querySelector('.pad-keys').addEventListener('click', (e) => {
            const b = e.target.closest('[data-k]');
            if (!b) return;
            key(b.dataset.k);
        });
        pad.querySelector('.pad-head').addEventListener('click', (e) => {
            if (e.target.closest('[data-k="close"]')) closePad();
        });
    }

    const vEl = (i) => $(VITALS[i][0]);

    function key(k) {
        navigator.vibrate?.(5);
        if (k === 'close' || k === 'ok') return closePad();
        if (k === 'next') { vAt = (vAt + 1) % VITALS.length; return drawPad(); }
        const el = vEl(vAt);
        if (!el) return;
        let v = String(el.value || '');
        if (k === 'del') v = v.slice(0, -1);
        else if (k === ',') v = el.type === 'number' ? (v.includes('.') ? v : v + '.') : (v.includes(',') ? v : v + ',');
        else if (k === '/') v = el.type === 'number' ? v : (v.includes('/') ? v : v + '/');
        else v += k;
        setVal(el, v);
        drawPad();
    }

    function drawPad() {
        const [id, ten, dv, ref] = VITALS[vAt];
        pad.querySelector('.pad-tabs').innerHTML = VITALS.map(([i2, t], i) => {
            const val = String($(i2)?.value || '').trim();
            return `<button type="button" class="pad-tab${i === vAt ? ' is-on' : ''}${val ? ' is-set' : ''}" data-i="${i}">${esc(t)}${val ? `<b>${esc(val)}</b>` : ''}</button>`;
        }).join('');
        pad.querySelector('.pad-val').textContent = String($(id)?.value || '') || '—';
        pad.querySelector('.pad-unit').textContent = dv;
        pad.querySelector('.pad-ref').textContent = ref ? 'bình thường ' + ref : '';
        /* Huyết áp là ô chữ nên có "/", mấy ô còn lại là ô số: khoá hai phím
           không dùng được thay vì để người ta chạm vào rồi thấy không ăn. */
        const isBp = $(id)?.type !== 'number';
        pad.querySelector('[data-k="/"]').disabled = !isBp;
    }

    function openPad() {
        if (!$('vital-pulse')) return showToast('Mục khám chưa mở — vào mục V–VI trước.', 'warning');
        if (!pad) buildPad();
        vAt = VITALS.findIndex(([id]) => !String($(id)?.value || '').trim());
        if (vAt < 0) vAt = 0;
        pad.classList.remove('hidden');
        document.body.classList.add('pad-on');
        drawPad();
    }
    function closePad() {
        pad.classList.add('hidden');
        document.body.classList.remove('pad-on');
        $(VITALS[vAt][0])?.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /* =================================================================
       3. NÚT CÁI + LỐI VÀO
       ================================================================= */
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'pv-fab';
    fab.className = 'pv-fab';
    fab.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Từng câu</span><b></b>';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    function syncFab() {
        if (!isPhone()) return;
        const l = walkFields().filter(f => !String(f.value || '').trim()).length;
        fab.querySelector('b').textContent = l || '';
        fab.classList.toggle('is-done', !l);
    }
    let fabT = 0;
    form.addEventListener('input', () => { clearTimeout(fabT); fabT = setTimeout(syncFab, 800); });
    document.querySelectorAll('.tab-link').forEach(l => l.addEventListener('click', () => setTimeout(syncFab, 400)));
    setTimeout(syncFab, 1200);

    // Lối vào thứ hai: khay công cụ ⋯ (nút cái có thể bị người dùng bỏ qua)
    $('ba-tools')?.insertAdjacentHTML('beforeend',
        '<button type="button" class="ba-tool dt-only" id="pv-open"><i class="fas fa-wand-magic-sparkles"></i> Điền từng câu</button>'
        + '<button type="button" class="ba-tool dt-only" id="pv-pad"><i class="fas fa-calculator"></i> Bàn phím sinh hiệu</button>');
    $('pv-open')?.addEventListener('click', open);
    $('pv-pad')?.addEventListener('click', openPad);

    // Ngay cạnh ô "gõ cả dòng sinh hiệu" — chỗ người ta đang định nhập sinh hiệu
    document.querySelector('.nl-vq')?.insertAdjacentHTML('beforeend',
        '<button type="button" class="nl-vq-go dt-only" id="pv-pad2"><i class="fas fa-calculator"></i> Phím số</button>');
    $('pv-pad2')?.addEventListener('click', openPad);

    addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (pv && !pv.classList.contains('hidden')) close();
        else if (pad && !pad.classList.contains('hidden')) closePad();
    });
}
