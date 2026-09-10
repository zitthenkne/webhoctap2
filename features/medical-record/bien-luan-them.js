/* =====================================================================
   bien-luan-them.js — MƯỜI BỐN THỨ LÀM CHO MỤC X BIẾT NGHĨ CÙNG SINH VIÊN

   bien-luan-editor.js đã lo phần NHẬP (4 khối tư duy, chip gợi ý, sơ đồ).
   File này lo phần ĐỐI CHIẾU: lấy đúng dữ kiện đã có trong bệnh án, đặt cạnh
   từng nhánh chẩn đoán rồi nói thẳng nhánh nào đứng vững, nhánh nào đang
   trống, và thầy sẽ hỏi gì. Không thêm ô lưu trữ nào — mọi thứ tính lại từ
   dữ liệu đang có, nên không đụng record/buildModel.

   Mọi thao tác GHI đều đi qua chính ô nhập của bien-luan-editor (đặt value rồi
   phát input/change), không gọi setBienLuan: nhờ vậy onChange của editor vẫn
   chạy đủ dây chuyền (cascade sang chẩn đoán, mục XI, tự lưu, thanh %).

   1. Bảng đối chiếu   mỗi nhánh × dấu hiệu then chốt: ✓ đã có · ✗ đã ghi âm
                       tính · ? chưa hỏi. Chạm "?" là nhảy tới chỗ để hỏi.
   2. Xếp hạng lại     điểm khớp của từng nhánh; nhánh 🔴 mà thua nhánh khác
                       thì nói ra và đổi mức được ngay tại chỗ.
   3. Còn thiếu để chốt cận lâm sàng và ô khám mà chẩn đoán đó đòi, trừ đi cái
                       đã có; một chạm ghi thẳng vào nhánh.
   4. CLS đã có nói gì chỉ số bất thường ở mục XII thuộc về nhánh nào, một
                       chạm đưa xuống ô "vì…" của nhánh đó.
   5. Thầy sẽ hỏi gì   câu hỏi phản biện sinh ra từ chính chỗ còn hổng.
   6. So A với B       hai nhánh đặt cạnh nhau: giống, khác, phân định bằng gì.
   7. Chạm dấu chứng   nhảy về đúng ô đã ghi ra nó trong bệnh án.
   8. Thanh tổng quan  đếm chỗ hổng ngay trên đầu mục X, chạm là tới.
   9. Trình bày        màn hình lớn từng vấn đề để đọc trước thầy.
  10. Điện thoại       thẻ biện luận gấp lại theo 3 bước, hết cuộn dọc dài.
  11. Ma trận          bảng nhánh × dấu chứng, mỗi ô bấm được: ✓ ✗ ghi thành lý
                       do của đúng cột, ? ghi thành âm tính. Đây là cách thầy
                       dạy phân biệt trên bảng, trước nay chưa có ở đâu.
  12. Hỏi vặn từng câu ba mươi câu bày một lúc thì đọc xong là nản; nay một câu
                       một lúc, có thanh tiến độ và nút nhảy thẳng tới chỗ sửa.
  13. Ống nhòm         bấm một thẻ dấu chứng là thấy nó ủng hộ nhánh nào, chống
                       nhánh nào, nhánh nào chưa dùng tới — gắn ngay tại chỗ.
  14. Chia đôi màn     màn ≥1280px: gõ bên trái, bàn cân bên phải, hết bấm qua
                       lại giữa hai tab.

   Điểm khớp không còn tính ở đây: đã tách sang bien-luan-diem.js để bảng nhập
   và ma trận cùng đọc MỘT con số.
   ===================================================================== */

import { showToast } from '../../core/utils.js';
import { goTo } from './tao-benh-an-them.js';
import { getBienLuan, LEVELS } from './bien-luan-editor.js';
import { clsForCause, tieuChuanFor } from './bien-luan-data.js';
/* Bộ chấm điểm đã tách ra file riêng để bảng nhập, ma trận và bàn cân cùng
   dùng MỘT con số — trước đây nó nằm kín trong closure này nên chỉ tab
   "Đối chiếu" mới thấy được nhánh nào đang đứng vững. */
import { pools, checkCause, scoreOf, findIn, featuresOf } from './bien-luan-diem.js';
import { requirementsFor } from './clinical-validator.js';
import { getCls } from './cls-editor.js';
import { abnormalItems } from './cls-shared.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const host = $('bl-host');
const form = $('medical-record-form');
const isPhone = () => matchMedia('(max-width: 640px)').matches;

if (host && form) init();

function init() {

    const splitCsv = (t) => String(t || '').split(/[;,]/).map(trim).filter(Boolean);
    const hasTxt = (hay, needle) => fold(hay).includes(fold(needle));

    const problems = () => getBienLuan().vanDe;

    /** Cận lâm sàng ca này đã có (đã đặt ở mục XII hoặc đã ghi trong nhánh) */
    const labsHave = () => [...getCls().map(i => i.n), ...splitCsv($('labs-proposed')?.value || '')];

    /**
     * Hai câu hỏi khác nhau, trước gộp làm một nên luôn ra rỗng:
     *   thieu   — bộ CLS chuẩn của bệnh này mà NHÁNH chưa ghi (bấm để ghi vào)
     *   chuaLam — CLS nhánh đã đòi mà bệnh án CHƯA đề nghị / chưa có kết quả
     */
    function missingFor(ten, cls) {
        const need = [...new Set([...splitCsv(clsForCause(ten)),
        ...requirementsFor(ten).labs.map(l => l.ten)])];
        const co = labsHave();
        const trong = splitCsv(cls);
        const khop = (list, x) => list.some(h => hasTxt(h, x) || hasTxt(x, h));
        return {
            thieu: need.filter(x => !khop(trong, x)),
            chuaLam: [...new Set([...need, ...trong])].filter(x => !khop(co, x))
        };
    }

    /* =================================================================
       GHI NGƯỢC VÀO Ô CỦA EDITOR
       Tìm theo TÊN chứ không theo chỉ số: getBienLuan() đã lọc bỏ nhánh trống
       nên số thứ tự của nó không còn khớp với data-v / data-n trên DOM.
       ================================================================= */
    const cardOf = (tenVd) => [...host.querySelectorAll('.tr-card')]
        .find(c => fold(c.querySelector('.tr-title')?.value || '') === fold(tenVd));

    function leafOf(tenVd, tenNn) {
        const card = cardOf(tenVd);
        if (!card) return null;
        return [...card.querySelectorAll('.tr-leaf[data-n]')]
            .find(l => fold(l.querySelector('.name')?.value || '') === fold(tenNn)) || null;
    }

    function writeLeaf(tenVd, tenNn, key, value, { append = true } = {}) {
        const leaf = leafOf(tenVd, tenNn);
        const el = leaf?.querySelector(`[data-k="${key}"]`);
        if (!el) return showToast('Không tìm thấy nhánh đó nữa — có thể vừa đổi tên.', 'warning');
        const cur = trim(el.value);
        el.value = append && cur ? cur.replace(/[;,\s]+$/, '') + '; ' + value : value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        showToast('Đã ghi vào nhánh ' + tenNn + '.', 'success', 1800);
        draw();
    }

    function setLevel(tenVd, tenNn, li) {
        const sel = leafOf(tenVd, tenNn)?.querySelector('.tr-lv');
        if (!sel) return;
        sel.selectedIndex = li;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        showToast(`Đã chuyển "${tenNn}" sang mức ${LEVELS[li]}.`, 'success', 2000);
        setTimeout(draw, 60);
    }

    /** Nhảy tới ô đầu tiên trong bệnh án có chứa đoạn chữ này */
    function goToText(t) {
        const q = fold(t).slice(0, 40);
        const el = [...form.querySelectorAll('input:not([type=hidden]), textarea')]
            .find(f => f.value && f.offsetParent !== null && fold(f.value).includes(q));
        if (!el) return showToast('Chữ này chưa nằm ở ô nào của bệnh án — nó đến từ thư viện gợi ý.', 'info', 2600);
        goTo(el);
    }

    /* =================================================================
       8. THANH TỔNG QUAN
       ================================================================= */
    const bar = document.createElement('div');
    bar.className = 'blx-bar';
    bar.setAttribute('data-nocount', '');
    host.before(bar);

    function gaps() {
        const vs = problems();
        const nn = vs.flatMap(v => v.nguyenNhan.map(n => ({ v, n })));
        return {
            vd: vs.length,
            nn: nn.length,
            noLy: nn.filter(x => !trim(x.n.lyDo)),
            noCls: nn.filter(x => !trim(x.n.cls)),
            noTop: vs.filter(v => v.nguyenNhan.length && !v.nguyenNhan.some(n => n.muc === LEVELS[0])),
            noEv: vs.filter(v => !v.lamSang.length),
            noBc: vs.filter(v => !v.bienChung.length)
        };
    }

    function drawBar() {
        const g = gaps();
        const chip = (n, txt, act, warn) => n
            ? `<button type="button" class="blx-chip${warn ? ' is-warn' : ''}" data-go="${act}">${n} ${esc(txt)}</button>` : '';
        bar.innerHTML = g.vd
            ? `<span class="blx-sum"><b>${g.vd}</b> vấn đề · <b>${g.nn}</b> nhánh</span>
               ${chip(g.noEv.length, 'vấn đề chưa có dấu chứng', 'ev', 1)}
               ${chip(g.noTop.length, 'vấn đề chưa chốt hướng nghĩ', 'top', 1)}
               ${chip(g.noLy.length, 'nhánh chưa có lý do', 'ly', 1)}
               ${chip(g.noCls.length, 'nhánh chưa có CLS phân định', 'cls', 0)}
               ${chip(g.noBc.length, 'vấn đề chưa bàn biến chứng', 'bc', 0)}
               <span class="blx-grow"></span>
               <button type="button" class="blx-chip is-key" data-go="show"><i class="fas fa-scale-balanced"></i> Bàn cân biện luận</button>`
            : '<span class="blx-sum">Chưa có vấn đề nào — bấm “Lấy vấn đề từ mục VIII” để bắt đầu.</span>';
    }

    bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (!b) return;
        const k = b.dataset.go;
        if (k === 'show') return openMode('can');
        const g = gaps();
        const pick = { ev: g.noEv[0], top: g.noTop[0], bc: g.noBc[0] }[k];
        if (pick) {
            const card = cardOf(pick.ten);
            card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card?.querySelector(k === 'ev' ? '.tr-tag-in' : '.tr-title')?.focus();
            return;
        }
        const x = (k === 'ly' ? g.noLy : g.noCls)[0];
        if (!x) return;
        const leaf = leafOf(x.v.ten, x.n.ten);
        leaf?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        leaf?.querySelector(k === 'ly' ? '[data-k="lyDo"]' : '[data-k="cls"]')?.focus();
    });

    /* =================================================================
       BẢNG LỚN: 3 chế độ mới trong thanh chế độ có sẵn
       ================================================================= */
    const seg = $('bl-mode');
    seg?.insertAdjacentHTML('beforeend',
        '<button type="button" data-mode="can"><i class="fas fa-scale-balanced"></i> Đối chiếu</button>'
        + '<button type="button" data-mode="ma"><i class="fas fa-table-cells"></i> Ma trận</button>'
        + '<button type="button" data-mode="hoi"><i class="fas fa-comments"></i> Hỏi vặn</button>'
        + '<button type="button" data-mode="vs"><i class="fas fa-code-compare"></i> So A–B</button>');

    const panel = document.createElement('div');
    panel.className = 'blx-panel is-hidden';
    panel.setAttribute('data-nocount', '');
    host.after(panel);

    /* =================================================================
       9. CHIA ĐÔI MÀN HÌNH
       Trước đây bốn màn đối chiếu nằm ở tab khác, muốn xem thì phải rời chỗ
       đang gõ. Trên màn ≥1280px thì đặt cạnh nhau: gõ bên trái, bàn cân bên
       phải tự cập nhật theo. Nút chỉ hiện khi màn đủ rộng.
       ================================================================= */
    const wrap = host.parentElement;
    let chiaDoi = false;
    const nutChia = document.createElement('button');
    nutChia.type = 'button';
    nutChia.className = 'bl-mini blx-split-b';
    nutChia.innerHTML = '<i class="fas fa-table-columns"></i> Chia đôi màn hình';
    seg?.parentElement?.appendChild(nutChia);
    nutChia.addEventListener('click', () => {
        chiaDoi = !chiaDoi;
        wrap?.classList.toggle('blx-split', chiaDoi);
        nutChia.classList.toggle('is-on', chiaDoi);
        nutChia.innerHTML = chiaDoi
            ? '<i class="fas fa-xmark"></i> Bỏ chia đôi'
            : '<i class="fas fa-table-columns"></i> Chia đôi màn hình';
        if (chiaDoi) {
            host.classList.remove('is-hidden');
            if (!laMine(mode)) openMode('can');
            else { panel.classList.remove('is-hidden'); draw(); }
        } else if (laMine(mode)) host.classList.add('is-hidden');
    });

    const laMine = (m) => ['can', 'ma', 'hoi', 'vs'].includes(m);

    let mode = 'table';
    function openMode(m) {
        seg?.querySelector(`[data-mode="${m}"]`)?.click();
    }
    seg?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        mode = b.dataset.mode;
        const mine = laMine(mode);
        panel.classList.toggle('is-hidden', !mine);
        // Chia đôi thì bảng nhập ở lại bên trái, không giấu đi nữa
        host.classList.toggle('is-hidden', (mine && !chiaDoi) || mode === 'map');
        if (mine) draw();
    });

    /* =================================================================
       1 + 2 + 3 + 4. BÀN CÂN
       ================================================================= */
    function drawCan() {
        const vs = problems();
        if (!vs.length) return '<p class="blx-empty">Chưa có vấn đề nào để đối chiếu.</p>';
        const abn = abnormalItems(getCls());

        return vs.map(v => {
            const pool = pools(v);
            const rows = v.nguyenNhan.map(n => {
                const ck = checkCause(n.ten, pool);
                return { n, ck, sc: scoreOf(ck) };
            });
            // Xếp hạng theo tỉ lệ khớp; nhánh chưa có bộ dấu hiệu đứng cuối
            const rank = [...rows].filter(r => r.sc.tot).sort((a, b) => b.sc.pct - a.sc.pct);
            const top = rows.find(r => r.n.muc === LEVELS[0]);
            const best = rank[0];
            const lech = best && top && best.n.ten !== top.n.ten && best.sc.yes - (top.sc.yes || 0) >= 2;

            return `<section class="blx-vd">
                <h4 class="blx-h"><i class="fas fa-diagram-project"></i> ${esc(v.ten || 'Vấn đề chưa đặt tên')}</h4>
                ${lech ? `<div class="blx-warn">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>Đang xếp <b>${esc(top.n.ten)}</b> là nghĩ nhiều nhất (khớp ${top.sc.yes}/${top.sc.tot}),
                    nhưng <b>${esc(best.n.ten)}</b> khớp tới ${best.sc.yes}/${best.sc.tot} dấu hiệu then chốt.</span>
                    <button type="button" class="blx-b" data-act="swap" data-vd="${esc(v.ten)}" data-a="${esc(best.n.ten)}" data-b="${esc(top.n.ten)}">Đổi chỗ hai nhánh</button>
                </div>` : ''}

                ${rows.length ? rows.map(r => causeBlock(v, r, abn)).join('')
                    : '<p class="blx-empty">Vấn đề này chưa có nhánh nguyên nhân nào.</p>'}
            </section>`;
        }).join('');
    }

    function causeBlock(v, r, abn) {
        const { n, ck, sc } = r;
        const li = Math.max(0, LEVELS.indexOf(n.muc));
        const { thieu, chuaLam } = missingFor(n.ten, n.cls);
        const needs = requirementsFor(n.ten).needs;
        const tc = tieuChuanFor(n.ten);
        /* Chỉ số bất thường của mục XII rơi vào bộ CLS phân định của nhánh này */
        const labs = abn.filter(i => hasTxt(clsForCause(n.ten) + ' ' + (n.cls || ''), i.n));

        return `<div class="blx-cause lv-${li}">
            <div class="blx-cause-h">
                <b>${esc(n.ten)}</b>
                <span class="blx-lv">${esc(n.muc || LEVELS[1])}</span>
                ${sc.tot ? `<span class="blx-score" title="dấu hiệu then chốt khớp với bệnh án">
                    <i style="width:${sc.pct}%"></i><em>${sc.yes}/${sc.tot}</em></span>` : ''}
            </div>

            ${sc.tot ? `<div class="blx-feats">${ck.map(f => `
                <button type="button" class="blx-f is-${f.st}" data-act="feat" data-st="${f.st}"
                    data-text="${esc(f.src || f.t)}" title="${esc(f.st === 'yes' ? 'đã có: ' + f.src
                        : f.st === 'no' ? 'đã ghi âm tính: ' + f.src : 'chưa hỏi / chưa khám')}">
                    ${f.st === 'yes' ? '✓' : f.st === 'no' ? '✗' : '?'} ${esc(f.t)}</button>`).join('')}</div>`
                : '<p class="blx-note">Thư viện chưa có bộ dấu hiệu then chốt cho tên này — đối chiếu bằng tiêu chuẩn bên dưới.</p>'}

            ${tc ? `<p class="blx-crit"><i class="fas fa-clipboard-check"></i> <b>Tiêu chuẩn:</b> ${esc(tc)}</p>` : ''}

            ${thieu.length ? `<div class="blx-need">
                <span><i class="fas fa-vials"></i> Bộ phân định chuẩn nhánh chưa ghi:</span>
                ${thieu.slice(0, 8).map(t => `<button type="button" class="blx-b sm" data-act="add-cls"
                    data-vd="${esc(v.ten)}" data-nn="${esc(n.ten)}" data-text="${esc(t)}">+ ${esc(t)}</button>`).join('')}
                <button type="button" class="blx-b sm is-key" data-act="add-cls-all"
                    data-vd="${esc(v.ten)}" data-nn="${esc(n.ten)}" data-text="${esc(thieu.slice(0, 8).join('; '))}">Ghi hết vào nhánh</button>
            </div>` : ''}

            ${chuaLam.length ? `<div class="blx-need">
                <span><i class="fas fa-hourglass-half"></i> Chưa đề nghị / chưa có kết quả:</span>
                <span class="blx-miss">${esc(chuaLam.slice(0, 8).join(' · '))}</span>
                <button type="button" class="blx-b sm" data-act="to-cls">Đổ sang mục XI</button>
            </div>` : ''}

            ${needs.length ? `<div class="blx-need">
                <span><i class="fas fa-stethoscope"></i> Ô khám phải mô tả:</span>
                ${needs.slice(0, 5).map(x => `<button type="button" class="blx-b sm" data-act="go-field"
                    data-field="${esc(x.field)}">${esc(x.label)}</button>`).join('')}
            </div>` : ''}

            ${labs.length ? `<div class="blx-labs">
                <span><i class="fas fa-flask"></i> Kết quả đã có liên quan nhánh này:</span>
                ${labs.map(i => `<button type="button" class="blx-b sm ${i.flag === 'high' ? 'up' : 'down'}"
                    data-act="add-ly" data-vd="${esc(v.ten)}" data-nn="${esc(n.ten)}"
                    data-text="${esc(`${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? 'tăng' : 'giảm'}`)}">
                    ${esc(i.n)} ${esc(i.v)} ${i.flag === 'high' ? '↑' : '↓'} → ghi vào “vì…”</button>`).join('')}
            </div>` : ''}
        </div>`;
    }

    /* =================================================================
       5. THẦY SẼ HỎI GÌ
       ================================================================= */
    function drawHoi() {
        const vs = problems();
        if (!vs.length) return '<p class="blx-empty">Chưa có vấn đề nào để soi.</p>';
        const q = [];
        const push = (t, why, act) => q.push({ t, why, ...act });

        vs.forEach(v => {
            const pool = pools(v);
            if (!v.lamSang.length)
                push(`Dựa vào đâu em gọi đây là “${v.ten}”?`, 'khối ② chưa có dấu chứng nào', { vd: v.ten, f: 'ev' });
            if (!v.nguyenNhan.some(n => n.muc === LEVELS[0]))
                push(`Trong các khả năng đó, em nghĩ nhiều nhất tới cái nào? Vì sao?`, 'chưa nhánh nào ở mức 🔴', { vd: v.ten });
            if (!trim(v.yeuTo))
                push(`Bệnh nhân có yếu tố nguy cơ nào cho “${v.ten}”?`, 'ô yếu tố nguy cơ đang trống', { vd: v.ten, f: 'yt' });

            v.nguyenNhan.forEach(n => {
                if (!trim(n.lyDo))
                    push(`Vì sao em nghĩ tới “${n.ten}”?`, 'nhánh chưa có lý do', { vd: v.ten, nn: n.ten, f: 'lyDo' });
                if (!trim(n.cls))
                    push(`Em làm gì để phân định “${n.ten}” với các khả năng còn lại?`, 'nhánh chưa có CLS', { vd: v.ten, nn: n.ten, f: 'cls' });
                const ck = checkCause(n.ten, pool);
                const ask = ck.filter(f => f.st === 'ask').slice(0, 2);
                ask.forEach(f => push(`Bệnh nhân có “${f.t}” không?`,
                    `dấu hiệu then chốt của ${n.ten} mà bệnh án chưa nhắc tới`, { vd: v.ten }));
                const tc = tieuChuanFor(n.ten);
                if (tc && n.muc === LEVELS[0])
                    push(`Ca này đã đủ tiêu chuẩn chẩn đoán “${n.ten}” chưa?`, tc, { vd: v.ten, nn: n.ten });
                const { chuaLam } = missingFor(n.ten, n.cls);
                if (chuaLam.length && n.muc === LEVELS[0])
                    push(`Chưa có ${chuaLam.slice(0, 3).join(', ')} thì em chốt “${n.ten}” bằng gì?`,
                        'cận lâm sàng cần cho chẩn đoán này chưa được đề nghị hoặc chưa có kết quả', { vd: v.ten, nn: n.ten, f: 'cls' });
            });

            if (!v.bienChung.length)
                push(`“${v.ten}” có thể gây biến chứng gì? Em theo dõi bằng gì?`, 'khối ④ đang trống', { vd: v.ten });
            if (v.redFlags.length)
                push(`Em đã loại trừ ${v.redFlags.join(', ')} chưa? Bằng gì?`, 'bệnh cảnh đe dọa tính mạng đã nêu', { vd: v.ten });
        });

        const dx = trim($('final-diagnosis')?.value);
        const top = vs.flatMap(v => v.nguyenNhan).find(n => n.muc === LEVELS[0]);
        if (top && dx && !hasTxt(dx, top.ten))
            push(`Chẩn đoán xác định ghi “${dx}” nhưng nhánh nghĩ nhiều nhất lại là “${top.ten}” — cái nào mới đúng?`,
                'mục X và mục XIII đang lệch nhau', { field: 'final-diagnosis' });

        if (!q.length) return '<p class="blx-empty is-ok"><i class="fas fa-circle-check"></i> Không còn chỗ hổng nào lộ ra — phần biện luận đang kín.</p>';

        const list = q.slice(0, 30);
        const dong = (x, i) => `<div class="blx-q">
            <span class="blx-qn">${i + 1}</span>
            <div><b>${esc(x.t)}</b><em>${esc(x.why)}</em></div>
            <button type="button" class="blx-b sm" data-act="go-q" data-vd="${esc(x.vd || '')}"
                data-nn="${esc(x.nn || '')}" data-f="${esc(x.f || '')}" data-field="${esc(x.field || '')}">Tới chỗ đó</button>
        </div>`;

        if (qAll) {
            return `<div class="blx-q-top"><p class="blx-lead">${list.length} câu thầy có thể vặn,
                    sinh ra từ chính chỗ còn trống trong bài của em.</p>
                <button type="button" class="blx-b sm" data-act="q-all"><i class="fas fa-list-check"></i> Hỏi từng câu</button></div>`
                + list.map(dong).join('');
        }

        /* Một câu một lúc. Ba mươi câu bày ra cùng lúc thì đọc xong là nản và
           không sửa câu nào; từng câu một thì mỗi câu là một việc làm được ngay. */
        qi = Math.max(0, Math.min(qi, list.length - 1));
        const x = list[qi];
        return `<div class="blx-wiz">
            <div class="blx-wiz-top">
                <span class="blx-wiz-n">Câu ${qi + 1} / ${list.length}</span>
                <span class="blx-wiz-bar"><i style="width:${Math.round((qi + 1) / list.length * 100)}%"></i></span>
                <button type="button" class="blx-b sm" data-act="q-all"><i class="fas fa-list-ul"></i> Xem cả danh sách</button>
            </div>
            <p class="blx-wiz-q">${esc(x.t)}</p>
            <p class="blx-wiz-why"><i class="fas fa-circle-info"></i> ${esc(x.why)}</p>
            <div class="blx-wiz-nav">
                <button type="button" class="blx-b" data-act="q-di" data-d="-1" ${qi === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-left"></i> Câu trước</button>
                <button type="button" class="blx-b is-key" data-act="go-q" data-vd="${esc(x.vd || '')}"
                    data-nn="${esc(x.nn || '')}" data-f="${esc(x.f || '')}" data-field="${esc(x.field || '')}">
                    <i class="fas fa-pen"></i> Trả lời ngay tại chỗ đó</button>
                <button type="button" class="blx-b" data-act="q-di" data-d="1" ${qi >= list.length - 1 ? 'disabled' : ''}>
                    Câu sau <i class="fas fa-arrow-right"></i></button>
            </div>
        </div>`;
    }
    let qi = 0, qAll = false;

    /* =================================================================
       MA TRẬN PHÂN BIỆT — hàng là dấu chứng, cột là nhánh chẩn đoán.
       Đây là cách thầy dạy phân biệt trên bảng: nhìn một ô là biết dấu hiệu
       đó ủng hộ nhánh nào, chống nhánh nào, và chỗ nào cả hàng còn bỏ trống.
       Mỗi ô BẤM ĐƯỢC: ✓ ✗ ghi thẳng vào ô "vì…" của đúng cột, ? ghi thành
       âm tính — không phải gõ lại câu nào.
       ================================================================= */
    const O_ICO = { yes: '✓', no: '✗', ask: '?' };

    function drawMa() {
        const vs = problems();
        if (!vs.length) return '<p class="blx-empty">Chưa có vấn đề nào để dựng ma trận.</p>';

        return vs.map(v => {
            const cot = v.nguyenNhan.filter(n => trim(n.ten)).slice(0, 5);
            if (!cot.length) return `<section class="blx-vd"><h4 class="blx-h">${esc(v.ten || 'Vấn đề chưa đặt tên')}</h4>
                <p class="blx-empty">Vấn đề này chưa có nhánh nguyên nhân nào.</p></section>`;

            const pool = pools(v);
            const ck = cot.map(n => checkCause(n.ten, pool));
            const sc = ck.map(scoreOf);

            /* Hàng = hợp của mọi đặc điểm các cột đòi hỏi, gộp trùng theo chữ
               đã bỏ dấu — nếu không thì "Ran nổ" của cột A và cột B thành hai hàng. */
            const hang = [];
            ck.forEach(rows => rows.forEach(f => {
                const k = fold(f.t);
                if (!hang.some(h => h.k === k)) hang.push({ k, t: f.t });
            }));
            if (hang.length > 18) hang.length = 18;
            if (!hang.length) return `<section class="blx-vd"><h4 class="blx-h">${esc(v.ten)}</h4>
                <p class="blx-note">Thư viện chưa có đặc điểm phân biệt cho các nhánh đang ghi.</p></section>`;

        const oCua = (j, k) => ck[j].find(f => fold(f.t) === k) || null;

            /* Ô mà bệnh của cột đó KHÔNG đòi hỏi: vẫn phải trả lời "bệnh nhân
               có cái này không", nếu không thì bảng thành đường chéo — cột nào
               cũng chỉ có dấu hiệu của riêng nó, đặt cạnh nhau chẳng so được gì.
               Ô loại này để mờ, chỉ soi chứ không ghi vào nhánh. */
            const oMo = (t) => findIn(t, pool.yes) ? 'yes' : findIn(t, pool.no) ? 'no' : 'ask';

            const thead = `<tr><th class="blx-m-first">Dấu chứng</th>${cot.map((n, j) =>
                `<th class="lv-${LEVELS.indexOf(n.muc)}"><b>${esc(n.ten)}</b>
                    <span class="blx-m-sc">${sc[j].pct ?? 0}%</span></th>`).join('')}</tr>`;

            const tbody = hang.map(h => `<tr>
                <th class="blx-m-first" title="Bấm để tìm chỗ đã ghi dấu chứng này trong bệnh án">
                    <button type="button" class="blx-m-lab" data-act="soi" data-text="${esc(h.t)}">${esc(h.t)}</button></th>
                ${cot.map((n, j) => {
                const f = oCua(j, h.k);
                if (!f) {
                    const st = oMo(h.t);
                    return `<td class="blx-m-o is-${st} is-mo">
                        <button type="button" data-act="soi" data-text="${esc(h.t)}"
                            title="${esc(n.ten)} không đòi dấu hiệu này — ${st === 'yes' ? 'nhưng bệnh nhân có'
                        : st === 'no' ? 'bệnh án đã ghi âm tính' : 'bệnh án chưa nhắc tới'}">
                            ${O_ICO[st]}</button></td>`;
                }
                return `<td class="blx-m-o is-${f.st}${f.huong === '-' ? ' is-nghich' : ''}">
                        <button type="button" data-act="o" data-st="${f.st}" data-huong="${f.huong}"
                            data-vd="${esc(v.ten)}" data-nn="${esc(n.ten)}" data-text="${esc(f.t)}"
                            title="${f.huong === '-' ? 'có dấu hiệu này thì BỚT nghĩ tới ' : 'ủng hộ '}${esc(n.ten)}${f.src ? ' — bệnh án ghi: ' + esc(f.src) : ''}">
                            ${O_ICO[f.st]}</button></td>`;
            }).join('')}
            </tr>`).join('');

            const tfoot = `<tr class="blx-m-foot"><th class="blx-m-first">Khớp</th>${sc.map(s =>
                `<td>✓ ${s.yes} · ✗ ${s.no} · ? ${s.ask}</td>`).join('')}</tr>`;

            return `<section class="blx-vd">
                <h4 class="blx-h"><i class="fas fa-table-cells"></i> ${esc(v.ten || 'Vấn đề chưa đặt tên')}</h4>
                <p class="blx-lead">Bấm một ô: <b>✓</b> ghi thành lý do ủng hộ · <b>✗</b> ghi thành bằng chứng chống
                    · <b>?</b> ghi nhận đã hỏi và không có. Cột nào cả cột toàn <b>?</b> là nhánh chưa hỏi gì tới.</p>
                <div class="blx-m-wrap"><table class="blx-m">
                    <thead>${thead}</thead><tbody>${tbody}</tbody><tfoot>${tfoot}</tfoot>
                </table></div>
            </section>`;
        }).join('');
    }

    /* =================================================================
       6. SO A VỚI B
       ================================================================= */
    let vsA = '', vsB = '';
    function drawVs() {
        const all = problems().flatMap(v => v.nguyenNhan.map(n => n.ten)).filter(Boolean);
        const uniq = [...new Set(all)];
        if (uniq.length < 2) return '<p class="blx-empty">Cần ít nhất hai nhánh chẩn đoán để so.</p>';
        if (!uniq.includes(vsA)) vsA = uniq[0];
        if (!uniq.includes(vsB) || vsB === vsA) vsB = uniq.find(x => x !== vsA) || uniq[1];

        const v = problems().find(p => p.nguyenNhan.some(n => n.ten === vsA)) || problems()[0];
        const pool = pools(v);
        const A = checkCause(vsA, pool), B = checkCause(vsB, pool);
        const key = (x) => fold(x.t);
        const chung = A.filter(a => B.some(b => key(b) === key(a)));
        const riengA = A.filter(a => !B.some(b => key(b) === key(a)));
        const riengB = B.filter(b => !A.some(a => key(a) === key(b)));
        const clsA = splitCsv(clsForCause(vsA)), clsB = splitCsv(clsForCause(vsB));
        const only = (x, y) => x.filter(t => !y.some(u => hasTxt(u, t) || hasTxt(t, u)));

        const col = (list) => list.length
            ? list.map(f => `<button type="button" class="blx-f is-${f.st}" data-act="feat" data-st="${f.st}"
                data-text="${esc(f.src || f.t)}">${f.st === 'yes' ? '✓' : f.st === 'no' ? '✗' : '?'} ${esc(f.t)}</button>`).join('')
            : '<span class="blx-note">—</span>';

        const sel = (id, val) => `<select class="blx-sel" data-sel="${id}">${uniq.map(x =>
            `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;

        return `<div class="blx-vs-head">${sel('a', vsA)}<span>đối đầu</span>${sel('b', vsB)}</div>
            <div class="blx-vs">
                <div class="blx-vs-col"><h5>Chỉ ủng hộ ${esc(vsA)}</h5>${col(riengA)}</div>
                <div class="blx-vs-col mid"><h5>Giống nhau — không phân định được</h5>${col(chung)}</div>
                <div class="blx-vs-col"><h5>Chỉ ủng hộ ${esc(vsB)}</h5>${col(riengB)}</div>
            </div>
            <div class="blx-vs-cls">
                <div><b><i class="fas fa-vials"></i> Phân định bằng (${esc(vsA)}):</b>
                    ${only(clsA, clsB).map(t => `<button type="button" class="blx-b sm" data-act="add-cls"
                        data-vd="${esc(v.ten)}" data-nn="${esc(vsA)}" data-text="${esc(t)}">+ ${esc(t)}</button>`).join('') || '<span class="blx-note">thư viện chưa có</span>'}</div>
                <div><b><i class="fas fa-vials"></i> Phân định bằng (${esc(vsB)}):</b>
                    ${only(clsB, clsA).map(t => `<button type="button" class="blx-b sm" data-act="add-cls"
                        data-vd="${esc(v.ten)}" data-nn="${esc(vsB)}" data-text="${esc(t)}">+ ${esc(t)}</button>`).join('') || '<span class="blx-note">thư viện chưa có</span>'}</div>
            </div>
            ${[vsA, vsB].map(t => tieuChuanFor(t) ? `<p class="blx-crit"><i class="fas fa-clipboard-check"></i>
                <b>${esc(t)}:</b> ${esc(tieuChuanFor(t))}</p>` : '').join('')}`;
    }

    /* =================================================================
       VẼ LẠI
       ================================================================= */
    function draw() {
        drawBar();
        if (panel.classList.contains('is-hidden')) return;
        panel.innerHTML = mode === 'hoi' ? drawHoi() : mode === 'vs' ? drawVs()
            : mode === 'ma' ? drawMa() : drawCan();
    }

    /** Ghi một câu âm tính vào đúng thẻ vấn đề — mượn chính ô "+ thêm" của editor
     *  để dây chuyền onChange (chẩn đoán, mục XI, tự lưu) vẫn chạy đủ. */
    function themAmTinh(tenVd, cau) {
        const inp = cardOf(tenVd)?.querySelector('.tr-tag-in[data-act="add-am"]');
        if (!inp) return showToast('Không tìm thấy thẻ vấn đề đó nữa.', 'warning');
        inp.value = cau;
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        showToast('Đã ghi vào âm tính có giá trị.', 'success', 1800);
        draw();
    }

    const chuThuong = (t) => trim(t).charAt(0).toLowerCase() + trim(t).slice(1);
    const cauAmTinh = (t) => /^kh[ôo]ng|^ch[ưu]a/i.test(trim(t)) ? trim(t) : 'không ' + chuThuong(t);

    panel.addEventListener('change', (e) => {
        const s = e.target.closest('[data-sel]');
        if (!s) return;
        if (s.dataset.sel === 'a') vsA = s.value; else vsB = s.value;
        draw();
    });

    panel.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const d = b.dataset;
        if (d.act === 'feat') {
            if (d.st === 'ask') return showToast('Chưa có trong bệnh án — hỏi / khám rồi ghi vào bệnh sử hoặc phần khám.', 'info', 3000);
            return goToText(d.text);
        }
        /* Ô trong ma trận: ba trạng thái, ba chỗ ghi khác nhau */
        if (d.act === 'o') {
            if (d.st === 'ask') return themAmTinh(d.vd, cauAmTinh(d.text));
            const nghich = d.huong === '-';
            // ✓ của một đặc điểm NGHỊCH là bằng chứng chống lại, phải nói rõ ra
            const cum = d.st === 'no' ? 'không ' + chuThuong(d.text)
                : nghich ? `có ${chuThuong(d.text)} — điểm không hợp` : chuThuong(d.text);
            return writeLeaf(d.vd, d.nn, 'lyDo', cum);
        }
        if (d.act === 'soi') return goToText(d.text);
        if (d.act === 'q-di') { qi += +d.d; return draw(); }
        if (d.act === 'q-all') { qAll = !qAll; qi = 0; return draw(); }
        if (d.act === 'add-cls' || d.act === 'add-cls-all') return writeLeaf(d.vd, d.nn, 'cls', d.text);
        if (d.act === 'to-cls') {
            $('bl-to-cls')?.click();
            return setTimeout(draw, 400);
        }
        if (d.act === 'add-ly') return writeLeaf(d.vd, d.nn, 'lyDo', d.text);
        if (d.act === 'go-field') { const el = $(d.field); return el ? goTo(el) : showToast('Ô đó không có trong loại bệnh án này.', 'info'); }
        if (d.act === 'swap') {
            setLevel(d.vd, d.b, 1);          // nhánh cũ xuống "Nghĩ tới"
            setTimeout(() => setLevel(d.vd, d.a, 0), 120);
            return;
        }
        if (d.act === 'go-q') {
            openMode('table');
            setTimeout(() => {
                if (d.field) return goTo($(d.field));
                if (d.nn) {
                    const leaf = leafOf(d.vd, d.nn);
                    leaf?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return leaf?.querySelector(d.f ? `[data-k="${d.f}"]` : '.name')?.focus();
                }
                const card = cardOf(d.vd);
                card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card?.querySelector(d.f === 'ev' ? '.tr-tag-in' : d.f === 'yt' ? '[data-k="yeuTo"]' : '.tr-title')?.focus();
            }, 80);
        }
    });

    /* =================================================================
       7. CHẠM DẤU CHỨNG TRONG THẺ → NHẢY VỀ Ô GỐC
       ================================================================= */
    host.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;          // nút xóa của chính thẻ
        const tag = e.target.closest('.tr-tag');
        if (tag) goToText(tag.textContent);
    });

    /* =================================================================
       9. TRÌNH BÀY — đọc trước thầy
       ================================================================= */
    let slide = null, sAt = 0, sList = [];

    function buildSlides() {
        sList = [];
        problems().forEach(v => {
            const nn = [...v.nguyenNhan].sort((a, b) => LEVELS.indexOf(a.muc) - LEVELS.indexOf(b.muc));
            sList.push({
                h: v.ten, k: 'Vấn đề & bằng chứng',
                b: `${v.lamSang.length ? `<p><b>Lâm sàng ủng hộ:</b> ${esc(v.lamSang.join('; '))}</p>` : ''}
                    ${v.amTinh.length ? `<p><b>Âm tính có giá trị:</b> ${esc(v.amTinh.join('; '))}</p>` : ''}
                    ${trim(v.yeuTo) ? `<p><b>Yếu tố nguy cơ:</b> ${esc(v.yeuTo)}</p>` : ''}`
            });
            sList.push({
                h: v.ten, k: 'Nghĩ tới gì — vì sao',
                b: nn.length ? nn.map(n => `<p><b>${esc(n.muc)}: ${esc(n.ten)}</b>${trim(n.lyDo) ? ' — ' + esc(n.lyDo) : ''}</p>`).join('')
                    : '<p class="blx-note">chưa có nhánh nào</p>'
            });
            sList.push({
                h: v.ten, k: 'Làm gì để phân định',
                b: (nn.filter(n => trim(n.cls)).map(n => `<p><b>${esc(n.ten)}:</b> ${esc(n.cls)}</p>`).join('')
                    || '<p class="blx-note">chưa ghi cận lâm sàng phân định</p>')
                    + (v.redFlags.length ? `<p><b>🚨 Phải loại trừ:</b> ${esc(v.redFlags.join('; '))}</p>` : '')
            });
            if (v.bienChung.length) sList.push({
                h: v.ten, k: 'Biến chứng & theo dõi',
                b: v.bienChung.map(b => `<p><b>${esc(b.ten)}</b>${trim(b.lapLuan) ? ' — ' + esc(b.lapLuan) : ''}</p>`).join('')
            });
        });
    }

    function drawSlide() {
        const s = sList[sAt];
        slide.querySelector('.blx-s-body').innerHTML = s
            ? `<span class="blx-s-k">${esc(s.k)}</span><h3>${esc(s.h)}</h3>${s.b}`
            : '<p class="blx-empty">Chưa có gì để trình bày.</p>';
        slide.querySelector('.blx-s-n').textContent = sList.length ? `${sAt + 1}/${sList.length}` : '';
    }

    function openSlides() {
        buildSlides();
        if (!sList.length) return showToast('Phần biện luận còn trống — chưa có gì để trình bày.', 'warning');
        if (!slide) {
            slide = document.createElement('div');
            slide.className = 'blx-slide hidden';
            slide.innerHTML = `
                <div class="blx-s-top">
                    <button type="button" class="pv-x" data-s="close" aria-label="Đóng"><i class="fas fa-xmark"></i></button>
                    <span class="blx-s-n"></span>
                </div>
                <div class="blx-s-body"></div>
                <div class="blx-s-foot">
                    <button type="button" class="pv-b" data-s="prev"><i class="fas fa-arrow-left"></i></button>
                    <button type="button" class="pv-b is-key" data-s="next">Tiếp <i class="fas fa-arrow-right"></i></button>
                </div>`;
            document.body.appendChild(slide);
            slide.addEventListener('click', (e) => {
                const b = e.target.closest('[data-s]');
                if (!b) return;
                if (b.dataset.s === 'close') { slide.classList.add('hidden'); document.body.classList.remove('blx-slide-on'); return; }
                sAt = Math.min(sList.length - 1, Math.max(0, sAt + (b.dataset.s === 'next' ? 1 : -1)));
                drawSlide();
            });
            let sx = 0;
            slide.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
            slide.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - sx;
                if (Math.abs(dx) < 70) return;
                sAt = Math.min(sList.length - 1, Math.max(0, sAt + (dx < 0 ? 1 : -1)));
                drawSlide();
            }, { passive: true });
        }
        sAt = 0;
        drawSlide();
        slide.classList.remove('hidden');
        document.body.classList.add('blx-slide-on');
    }

    $('bl-zoom')?.insertAdjacentHTML('afterend',
        '<button type="button" id="blx-present" class="bl-mini"><i class="fas fa-person-chalkboard"></i> Trình bày</button>');
    $('blx-present')?.addEventListener('click', openSlides);
    addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && slide && !slide.classList.contains('hidden')) slide.querySelector('[data-s="close"]').click();
    });

    /* =================================================================
       10. ĐIỆN THOẠI: thẻ biện luận gấp theo 3 bước
       Editor vẽ lại cả #bl-host sau mỗi thay đổi nên phải gắn lại bằng
       MutationObserver, và nhớ bước đang mở theo TÊN vấn đề (chỉ số đổi khi
       thêm / xóa thẻ).
       ================================================================= */
    const STEPS = [['② Bằng chứng', [0, 1, 2]], ['③ Nguyên nhân', [3]], ['④ Biến chứng', [4]]];
    const stepOf = new Map();

    function applyFold() {
        if (!isPhone()) return;
        host.querySelectorAll('.tr-card').forEach(card => {
            const key = card.querySelector('.tr-title')?.value || card.dataset.v;
            const cur = stepOf.get(key) ?? 0;
            if (!card.querySelector('.blx-steps')) {
                const nav = document.createElement('div');
                nav.className = 'blx-steps';
                nav.innerHTML = STEPS.map(([t], i) =>
                    `<button type="button" data-step="${i}">${esc(t)}</button>`).join('');
                card.querySelector('.tr-meta')?.after(nav);
            }
            card.querySelectorAll('.blx-steps button').forEach((b, i) => b.classList.toggle('is-on', i === cur));
            const branches = [...card.querySelectorAll('.tr-branch')];
            branches.forEach((b, i) => { b.hidden = !STEPS[cur][1].includes(i); });
        });
    }

    host.addEventListener('click', (e) => {
        const b = e.target.closest('.blx-steps button');
        if (!b) return;
        const card = b.closest('.tr-card');
        stepOf.set(card.querySelector('.tr-title')?.value || card.dataset.v, +b.dataset.step);
        applyFold();
    });

    /* Editor vẽ lại thẻ liên tục (mỗi lần đổi mức, thêm nhánh…) — bám bằng
       observer thay vì cố gọi đúng lúc. rAF gộp nhiều lần vẽ thành một. */
    let raf = 0;
    new MutationObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { applyFold(); drawBar(); });
    }).observe(host, { childList: true, subtree: false });

    /* =================================================================
       ỐNG NHÒM BẰNG CHỨNG
       Bấm một thẻ dấu chứng ở khối ② là thấy ngay nó ĐANG LÀM VIỆC CHO AI:
       ủng hộ nhánh nào, chống nhánh nào, nhánh nào chưa dùng tới. Trả lời
       đúng câu sinh viên hay bí — "cái này em ghi vào đâu bây giờ".
       ================================================================= */
    const soi = document.createElement('div');
    soi.className = 'blx-soi hidden';
    soi.setAttribute('data-nocount', '');
    document.body.appendChild(soi);

    function soiCua(text) {
        const ung = [], chong = [], chua = [];
        problems().forEach(v => v.nguyenNhan.forEach(n => {
            if (!trim(n.ten)) return;
            const f = featuresOf(n.ten).find(x => findIn(x.t, [text]));
            const daGhi = hasTxt(n.lyDo, text);
            if (!f) { if (!daGhi) chua.push({ v, n }); return; }
            (f.huong === '-' ? chong : ung).push({ v, n, f, daGhi });
        }));
        return { ung, chong, chua };
    }

    function moSoi(text, neo) {
        const r = soiCua(text);
        const nut = (x, nhan) => `<button type="button" class="blx-b sm" data-act="soi-ghi"
            data-vd="${esc(x.v.ten)}" data-nn="${esc(x.n.ten)}" data-text="${esc(nhan)}"
            ${x.daGhi ? 'disabled' : ''}>${x.daGhi ? '✓ đã ghi' : '+ ghi vào “vì…”'}</button>`;
        const nhom = (ten, list, cls, nhan) => list.length
            ? `<div class="blx-soi-g ${cls}"><h6>${ten}</h6>${list.map(x => `<div class="blx-soi-r">
                <b>${esc(x.n.ten)}</b><small>${esc(x.v.ten)}</small>${nut(x, nhan(x))}</div>`).join('')}</div>`
            : '';

        soi.innerHTML = `<div class="blx-soi-h"><b>${esc(text)}</b>
                <button type="button" class="blx-soi-x" data-act="soi-dong" aria-label="Đóng"><i class="fas fa-xmark"></i></button></div>
            ${nhom('Ủng hộ', r.ung, 'is-ung', () => chuThuong(text))}
            ${nhom('Càng có càng bớt nghĩ', r.chong, 'is-chong', () => `có ${chuThuong(text)} — điểm không hợp`)}
            ${r.chua.length ? `<div class="blx-soi-g is-chua"><h6>Chưa dùng ở ${r.chua.length} nhánh</h6>
                ${r.chua.slice(0, 6).map(x => `<div class="blx-soi-r"><b>${esc(x.n.ten)}</b>
                    <small>${esc(x.v.ten)}</small>${nut(x, chuThuong(text))}</div>`).join('')}</div>` : ''}
            ${!r.ung.length && !r.chong.length && !r.chua.length
                ? '<p class="blx-note">Chưa có nhánh nào để gắn dấu chứng này vào.</p>' : ''}`;

        soi.classList.remove('hidden');
        const b = neo.getBoundingClientRect();
        soi.style.top = (scrollY + b.bottom + 6) + 'px';
        soi.style.left = Math.max(8, Math.min(b.left, innerWidth - soi.offsetWidth - 8)) + 'px';
    }

    const dongSoi = () => soi.classList.add('hidden');

    host.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;             // nút xóa thẻ vẫn là nút xóa
        const tag = e.target.closest('.tr-tag[data-drag]');
        if (!tag) return dongSoi();
        moSoi(tag.dataset.drag, tag);
    });

    soi.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'soi-dong') return dongSoi();
        if (b.dataset.act === 'soi-ghi') {
            writeLeaf(b.dataset.vd, b.dataset.nn, 'lyDo', b.dataset.text);
            dongSoi();
        }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dongSoi(); });
    document.addEventListener('click', (e) => {
        if (!soi.contains(e.target) && !e.target.closest('.tr-tag')) dongSoi();
    });

    let t = 0;
    form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 900); });
    matchMedia('(max-width: 640px)').addEventListener('change', () => {
        if (!isPhone()) host.querySelectorAll('.tr-branch').forEach(b => { b.hidden = false; });
        else applyFold();
    });

    setTimeout(() => { drawBar(); applyFold(); }, 1200);
}
