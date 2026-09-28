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
/* X. THẺ VẤN ĐỀ — mỗi lúc một thẻ                                     */
/* ------------------------------------------------------------------ */
const host = document.getElementById('bl-host');
if (host) {
    let moV = '0';
    const cacThe = () => [...host.querySelectorAll(':scope > .tr-card')];

    function ap() {
        const ds = cacThe();
        // Lúc trang mới mở editor chưa kịp vẽ thẻ -> đừng vội bỏ lựa chọn "mở thẻ đầu"
        if (!ds.length) return;
        if (moV !== null && !ds.some(c => c.dataset.v === moV)) moV = ds[0].dataset.v;
        ds.forEach(c => {
            const mo = c.dataset.v === moV;
            c.classList.add('bl-o');
            c.classList.toggle('bl-mo', mo);
            const meta = c.querySelector(':scope > .tr-meta');
            if (!meta) return;
            let b = meta.querySelector(':scope > .bl-tg');
            if (!b) {
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'bl-tg';
                meta.appendChild(b);
            }
            const chu = mo ? 'Thu gọn ▴' : 'Mở thẻ ▾';
            if (b.textContent !== chu) b.textContent = chu;
        });
    }

    function moThe(c) {
        if (!c || c.dataset.v === moV) return;
        giuCho(c, () => { moV = c.dataset.v; ap(); });
    }

    host.addEventListener('click', e => {
        const b = e.target.closest('.bl-tg');
        if (!b) return;
        const c = b.closest('.tr-card');
        if (c.dataset.v === moV) { moV = null; ap(); } else moThe(c);
    });
    /* Nút bật/tắt được focus NGAY lúc nhấn xuống, trước cú click -> để focusin mở
       thẻ thì click ngay sau đó lại đóng nó. Nút đó chỉ nghe click. */
    host.addEventListener('focusin', e => { if (!e.target.closest('.bl-tg')) moThe(e.target.closest('.tr-card')); });
    host.addEventListener('ba:hien', e => moThe(e.target.closest('.tr-card')));

    new MutationObserver(hen(ap)).observe(host, { childList: true, subtree: true });
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
