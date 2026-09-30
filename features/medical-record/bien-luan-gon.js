/* =====================================================================
   MỤC BIỆN LUẬN GỌN (X. Biện luận + XI. Cận lâm sàng đề nghị) — 2026-09-28

   Đo trên điện thoại, bệnh án mẫu: mục VII–XI dài 10.038px. Hai khối nặng
   nhất không phải vì nhiều chữ mà vì bày HẾT cùng lúc:
     · X  : mọi thẻ vấn đề mở bung (thẻ 1 trên máy tính đã 2.312px)
     · XI : 17 dòng đề nghị x 4 ô chồng nhau = 4.595px, dòng này dính dòng kia
   Không xóa gì, chỉ đổi lúc nào hiện:
     · X  : mỗi lúc MỘT thẻ mở (mặc định thẻ đầu). Thẻ đóng còn tên + "4/4
            khối đã đủ ý" + nút "Mở thẻ ▾". Chạm vào ô trong thẻ cũng mở.
     · XI : mỗi dòng là một thẻ nhỏ — tên · 🔍 · ✕ · ▾ và một dòng tóm tắt
            điều đã ghi ("Để chẩn đoán xác định · … · mong thấy: …"). Chạm
            tóm tắt / ▾ / vào ô là bung đủ 4 ô để sửa.
   Hai editor gốc (bien-luan-editor.js, cls-de-nghi.js) vẽ lại innerHTML liên
   tục -> trạng thái mở nhớ theo data-v / data-i và gắn lại sau mỗi lần vẽ.
   Các cú "nhảy tới ô" (goTo của tao-benh-an-them.js) bắn sự kiện ba:hien
   trước khi cuộn -> thẻ / dòng đang thu gọn chứa ô đó tự mở.
   ===================================================================== */

/** Gọi fn một lần sau loạt thay đổi DOM (không dùng rAF: trang đứng yên là rAF im) */
function hen(fn) {
    let t = 0;
    return () => { clearTimeout(t); t = setTimeout(fn, 30); };
}

/** Mở khối mới rồi bù cuộn để khối vừa chạm không trôi khỏi ngón tay */
function giuCho(el, lam) {
    const truoc = el.getBoundingClientRect().top;
    lam();
    const lech = el.getBoundingClientRect().top - truoc;
    if (Math.abs(lech) > 1) scrollBy(0, lech);
}

/* ------------------------------------------------------------------ */
/* X. THẺ VẤN ĐỀ — mỗi lúc một thẻ, trong thẻ là 3 bước dạng tab      */
/* ------------------------------------------------------------------ */
/* 2026-09-30: người dùng thấy mục X "rối nùi, không biết nên làm như nào".
   Một thẻ vấn đề là đúng BA việc theo thứ tự, nên trình bày đúng như vậy:
     ② Bằng chứng  (tiêu chuẩn chẩn đoán · dấu chứng ủng hộ · âm tính · yếu tố nguy cơ)
     ③ Nguyên nhân (các nhánh chẩn đoán phân biệt xếp theo mức nghĩ)
     ④ Biến chứng
   Mỗi lúc một tab (có số đếm để biết tab nào còn trống), cuối tab có nút
   "Tiếp: …" dắt sang bước sau. Trong tab Nguyên nhân mỗi nhánh thu còn
   tên · mức nghĩ · lý do · CLS · thanh % — bảng tiêu chí ✓?✗ và máy tính thang
   điểm chỉ bung ở nhánh đang sửa. Trước đây chỉ điện thoại có dạng bước
   (bien-luan-them.js), máy tính bày cả 5 khối: thẻ 1 dài 2.300px. */
const host = document.getElementById('bl-host');
if (host) {
    let moV = '0';
    const tabOf = new Map();          // data-v của thẻ -> tab đang mở (0 | 1 | 2)
    let moLa = null;                  // "v|n" — nhánh nguyên nhân đang bung chi tiết
    const TAB = [['② Bằng chứng', 'fa-magnifying-glass'], ['③ Nguyên nhân', 'fa-code-branch'], ['④ Biến chứng', 'fa-notes-medical']];
    const NUT_TIEP = ['Tiếp: ③ Nguyên nhân', 'Tiếp: ④ Biến chứng'];
    const BR_TAB = [0, 0, 0, 1, 2];   // thứ tự .tr-branch trong thẻ -> tab
    const cacThe = () => [...host.querySelectorAll(':scope > .tr-card')];
    const NUT_CUA_TOI = '.bl-tg, .bl-tab, .bl-next, .bl-la-tg';

    const taoNut = (cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; return b; };
    const ghiChu = (el, s) => { if (el.textContent !== s) el.textContent = s; };

    function demTab(br) {
        const n0 = br[0]?.querySelectorAll('.tr-tags .tr-tag').length || 0;
        const n1 = br[1]?.querySelectorAll('.tr-tags .tr-tag').length || 0;
        const nn = br[3]?.querySelectorAll('.tr-leafwrap').length || 0;
        const bc = br[4]?.querySelectorAll('.tr-leaf.lv-warn').length || 0;
        return [
            n0 + n1 ? `${n0} ủng hộ · ${n1} âm tính` : 'chưa ghi',
            nn ? `${nn} nhánh` : 'chưa có nhánh',
            bc ? `${bc} biến chứng` : 'chưa ghi'
        ];
    }

    function apThe(c, mo) {
        c.classList.add('bl-o');
        c.classList.toggle('bl-mo', mo);
        const meta = c.querySelector(':scope > .tr-meta');
        if (!meta) return;
        const tg = meta.querySelector(':scope > .bl-tg') || meta.appendChild(taoNut('bl-tg'));
        ghiChu(tg, mo ? 'Thu gọn ▴' : 'Mở thẻ ▾');
        // Thẻ đã đủ 4/4 thì "Dựng nhanh cả thẻ" hết là việc chính -> nút phụ
        c.classList.toggle('bl-du', c.querySelectorAll('.tr-dots i.is-on').length >= 4);

        const br = [...c.querySelectorAll(':scope > .tr-branch')];
        br.forEach((b, i) => { b.dataset.bltab = BR_TAB[i] ?? 0; });
        const t = tabOf.get(c.dataset.v) ?? 0;
        c.dataset.bltab = t;

        let nav = c.querySelector(':scope > .bl-tabs');
        if (!nav) {
            nav = document.createElement('div');
            nav.className = 'bl-tabs';
            nav.setAttribute('role', 'tablist');
            (c.querySelector(':scope > .tr-near') || meta).after(nav);
        }
        const dem = demTab(br);
        const khoa = t + '|' + dem.join('|');
        if (nav.dataset.k !== khoa) {
            nav.dataset.k = khoa;
            nav.innerHTML = TAB.map(([ten, ic], i) =>
                `<button type="button" role="tab" class="bl-tab${i === t ? ' is-on' : ''}" data-tab="${i}" aria-selected="${i === t}">
                    <b><i class="fas ${ic}"></i> ${ten}</b><small>${dem[i]}</small></button>`).join('');
        }

        const tiep = c.querySelector(':scope > .bl-next') || c.appendChild(taoNut('bl-next'));
        ghiChu(tiep, t < 2 ? NUT_TIEP[t] + ' →' : 'Xong thẻ này — thu gọn ▴');

        // Nhánh nguyên nhân: có bảng tiêu chí / thang điểm thì thu lại, kèm nút xem
        c.querySelectorAll('.tr-leafwrap').forEach(w => {
            const nf = w.querySelectorAll(':scope > .tr-feats .tr-f').length;
            const th = [...w.querySelectorAll(':scope > .tr-thang .tr-thang-h b')].map(x => x.textContent.trim());
            const co = nf || th.length;
            const moW = co && moLa === c.dataset.v + '|' + w.dataset.n;
            w.classList.toggle('bl-la', !!co);
            w.classList.toggle('bl-la-mo', !!moW);
            let nut = w.querySelector('.bl-la-tg');
            if (!co) { nut?.remove(); return; }
            if (!nut) {
                nut = taoNut('bl-la-tg');
                const sc = w.querySelector(':scope > .tr-sc');
                if (sc) sc.appendChild(nut); else w.querySelector(':scope > .tr-leaf')?.after(nut);
            }
            ghiChu(nut, moW ? 'Thu tiêu chí ▴'
                : 'Xem ' + [nf && `${nf} tiêu chí`, th.join(', ')].filter(Boolean).join(' · ') + ' ▾');
        });
    }

    function ap() {
        const ds = cacThe();
        // Lúc trang mới mở editor chưa kịp vẽ thẻ -> đừng vội bỏ lựa chọn "mở thẻ đầu"
        if (!ds.length) return;
        if (moV !== null && !ds.some(c => c.dataset.v === moV)) moV = ds[0].dataset.v;
        ds.forEach(c => apThe(c, c.dataset.v === moV));
    }

    function moThe(c) {
        if (!c || c.dataset.v === moV) return;
        giuCho(c, () => { moV = c.dataset.v; ap(); });
    }
    function denTab(c, t) {
        tabOf.set(c.dataset.v, t);
        apThe(c, true);
        // Tab mới ngắn hơn / dài hơn — đưa đầu tab về tầm mắt nếu nó đã trôi lên trên
        const nav = c.querySelector(':scope > .bl-tabs');
        const tren = document.querySelector('.hd-top')?.offsetHeight || 0;
        if (nav && nav.getBoundingClientRect().top < tren) scrollTo({ top: nav.getBoundingClientRect().top + scrollY - tren - 12, behavior: 'smooth' });
    }

    host.addEventListener('click', e => {
        const c = e.target.closest('.tr-card');
        if (!c) return;
        if (e.target.closest('.bl-tg')) {
            if (c.dataset.v === moV) { moV = null; ap(); } else moThe(c);
            return;
        }
        const tab = e.target.closest('.bl-tab');
        if (tab) return denTab(c, +tab.dataset.tab);
        if (e.target.closest('.bl-next')) {
            const t = tabOf.get(c.dataset.v) ?? 0;
            if (t < 2) return denTab(c, t + 1);
            moV = null; ap();
            c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }
        const la = e.target.closest('.bl-la-tg');
        if (la) {
            const k = c.dataset.v + '|' + la.closest('.tr-leafwrap').dataset.n;
            moLa = moLa === k ? null : k;
            apThe(c, true);
        }
    });
    /* Nút của lớp này được focus NGAY lúc nhấn xuống, trước cú click -> để focusin xử
       lý thì click ngay sau đó làm ngược lại. Mấy nút đó chỉ nghe click. */
    host.addEventListener('focusin', e => {
        if (e.target.closest(NUT_CUA_TOI)) return;
        const c = e.target.closest('.tr-card');
        moThe(c);
        // Gõ vào ô của một nhánh -> bung tiêu chí của đúng nhánh đó (gợi ý "vì…" nằm trong đó)
        const w = e.target.closest('.tr-leafwrap');
        if (c && w) {
            const k = c.dataset.v + '|' + w.dataset.n;
            if (moLa !== k) { moLa = k; apThe(c, true); }
        }
    });
    // goTo() nhảy tới một ô đang ẩn (thẻ thu / tab khác / nhánh thu) -> mở đúng chỗ
    host.addEventListener('ba:hien', e => {
        const c = e.target.closest('.tr-card');
        if (!c) return;
        moThe(c);
        const b = e.target.closest('.tr-branch');
        if (b) tabOf.set(c.dataset.v, +(b.dataset.bltab || 0));
        const w = e.target.closest('.tr-leafwrap');
        if (w) moLa = c.dataset.v + '|' + w.dataset.n;
        apThe(c, true);
    });

    /* Editor vẽ lại cả #bl-host sau mỗi thay đổi. Gắn lại NGAY trong microtask của
       observer (trước khi trình duyệt vẽ) — hẹn giờ là thấy thẻ bung đủ 5 khối rồi
       mới gập lại. ap() chỉ ghi khi khác nên lượt gọi thứ hai không đổi gì, dừng. */
    let dangAp = false;
    new MutationObserver(() => {
        if (dangAp) return;
        dangAp = true;
        try { ap(); } finally { dangAp = false; }
    }).observe(host, { childList: true, subtree: true });
    ap();
}

/* ------------------------------------------------------------------ */
/* XI. DÒNG CẬN LÂM SÀNG ĐỀ NGHỊ — thẻ nhỏ có dòng tóm tắt             */
/* ------------------------------------------------------------------ */
const list = document.getElementById('cls-dn-list');
if (list) {
    let moI = null;

    function tomTat(r) {
        const muc = r.querySelector('.cd-muc')?.value || '';          // "để chẩn đoán xác định"
        const dich = r.querySelector('.cd-dich')?.value.trim() || '';
        const ky = r.querySelector('.cd-ky input')?.value.trim() || '';
        const s = [muc, dich, ky && 'mong thấy: ' + ky].filter(Boolean).join(' · ');
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function ap() {
        const rows = [...list.querySelectorAll(':scope > .cd-row')];
        if (moI !== null && !rows.some(r => r.dataset.i === moI)) moI = null;
        rows.forEach(r => {
            const mo = r.dataset.i === moI;
            r.classList.add('cd-o');
            r.classList.toggle('cd-mo', mo);

            let t = r.querySelector(':scope > .cd-tom');
            if (!t) {
                t = document.createElement('button');
                t.type = 'button';
                t.className = 'cd-tom';
                r.appendChild(t);
            }
            const s = tomTat(r);
            const chu = s || 'Chưa ghi đề nghị để làm gì — chạm để điền';
            if (t.textContent !== chu) t.textContent = chu;
            t.classList.toggle('is-trong', !s);

            let g = r.querySelector(':scope > .cd-tg');
            if (!g) {
                g = document.createElement('button');
                g.type = 'button';
                g.className = 'cd-tg';
                g.setAttribute('aria-label', 'Mở / thu gọn dòng');
                r.appendChild(g);
            }
            const mui = mo ? '▴' : '▾';
            if (g.textContent !== mui) g.textContent = mui;
        });
    }
    const apSau = hen(ap);

    function moDong(r) {
        if (!r || r.dataset.i === moI) return;
        giuCho(r, () => { moI = r.dataset.i; ap(); });
    }

    list.addEventListener('click', e => {
        const r = e.target.closest('.cd-row');
        if (!r) return;
        if (e.target.closest('.cd-tg')) {
            if (r.dataset.i === moI) { moI = null; ap(); } else moDong(r);
        } else if (e.target.closest('.cd-tom')) moDong(r);
    });
    list.addEventListener('focusin', e => { if (!e.target.closest('.cd-tg')) moDong(e.target.closest('.cd-row')); });
    list.addEventListener('ba:hien', e => moDong(e.target.closest('.cd-row')));
    // Sửa ô xong thì dòng tóm tắt phải theo kịp (giá trị ô không làm đổi DOM)
    list.addEventListener('input', apSau);
    list.addEventListener('change', apSau);

    new MutationObserver(apSau).observe(list, { childList: true, subtree: true });
    ap();
}

/* ------------------------------------------------------------------ */
/* VII & CHẨN ĐOÁN PHÂN BIỆT — Ô CHỮ DÀI THU GỌN KHI KHÔNG GÕ          */
/* Hai ô này thường 15–25 dòng (điện thoại: tóm tắt 542px, CĐPB 686px) */
/* nên bày hết thì phải cuộn qua cả màn hình chữ mới tới mục sau. Khi   */
/* không gõ: còn ~9 dòng, mờ dần ở đáy, nút "Xem hết". Chạm vào ô để sửa */
/* là bung đủ. Chỉ gắn class — chữ trong ô, tự lưu, tự cao không đổi.   */
/* ------------------------------------------------------------------ */
['summary', 'differential-diagnosis'].forEach(id => {
    const ta = document.getElementById(id);
    if (!ta) return;
    const nut = document.createElement('button');
    nut.type = 'button';
    nut.className = 'hd-xemhet';
    nut.hidden = true;
    ta.after(nut);
    let mo = false;
    function ve() {
        // Hàng chip gợi ý được chèn NGAY sau ô (goi-y-nhap.js, chạy sau) -> kéo nút về sát ô
        if (ta.nextElementSibling !== nut) ta.after(nut);
        const dangGo = document.activeElement === ta;
        const dai = ta.scrollHeight > 290;               // hơn ~11 dòng mới đáng thu
        const gon = dai && !mo && !dangGo;
        if (ta.classList.contains('hd-gon') !== gon) ta.classList.toggle('hd-gon', gon);
        const an = !dai || dangGo;
        if (nut.hidden !== an) nut.hidden = an;
        const chu = mo ? 'Thu gọn ▴' : 'Xem hết ▾';
        if (nut.textContent !== chu) nut.textContent = chu;
    }
    nut.addEventListener('click', () => { mo = !mo; ve(); });
    ta.addEventListener('focus', ve);
    ta.addEventListener('blur', () => setTimeout(ve, 0));
    ta.addEventListener('input', ve);
    // Máy ghép tóm tắt / tự cao / mục vừa hiện ra (0 -> cao thật) đều làm đổi kích thước
    new ResizeObserver(ve).observe(ta);
    ve();
});
