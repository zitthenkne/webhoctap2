// room-scrollhold.js — giữ nguyên CHỖ ĐANG ĐỌC khi nội dung phía trên đổi chiều cao.
// Vì sao cần: Safari (iPad / iPhone) KHÔNG có scroll anchoring như Chrome. Trong phòng, ai bấm đáp án /
// gõ nhận xét / hiện đáp án thì máy mình vẽ lại (chip, khay, KaTeX nạp xong…) -> chiều cao khối nằm TRÊN
// chỗ đang đọc đổi -> trang trôi lên / kéo xuống dù mình không chạm gì.
// Cách làm: nhớ 1 mốc (phần tử có id / data-card đang ở mép trên màn + khoảng cách tới mép). Sau mỗi lần
// DOM đổi (MutationObserver chạy TRƯỚC khi vẽ -> không nháy) thì bù scrollTop đúng phần mốc bị dịch.
// Không bù khi: đang ở đầu trang · đang gõ trong ô (để bàn phím/con trỏ tự lo) · vừa đổi câu.
const SEL = '[id], [data-card]';
const SKIP = '.rm-topbar, .rm-hudopts, .rm-dock, .rm-sheet-grip';   // dính cố định -> không làm mốc
let root = null;
let anchor = null;      // { sel, off }
let raf = 0;

function scroller() {
    if (root && root.isConnected) return root;
    for (let n = document.getElementById('options-area'); n && n !== document.body; n = n.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) return (root = n);
    }
    return document.scrollingElement || document.documentElement;
}
const topOf = (sc) => (sc === document.scrollingElement || sc === document.documentElement ? 0 : sc.getBoundingClientRect().top);
const editing = () => {
    const a = document.activeElement;
    return !!a && a !== document.body && a.matches?.('input, textarea, select, [contenteditable="true"]');
};

function capture() {
    const sc = scroller();
    if (sc.scrollTop < 8) { anchor = null; return; }
    const top = topOf(sc);
    let hit = null;
    for (const n of sc.querySelectorAll(SEL)) {
        if (n.closest(SKIP)) continue;
        const r = n.getBoundingClientRect();
        if (!r.height) continue;
        if (r.top <= top + 2) { if (r.bottom > top + 2) hit = { n, r }; continue; }   // chứa mép trên: lấy cái sâu nhất
        if (!hit) hit = { n, r };                                                       // không có -> cái đầu tiên bên dưới
        break;
    }
    if (!hit) { anchor = null; return; }
    const id = hit.n.id;
    anchor = { sel: id ? '#' + CSS.escape(id) : `[data-card="${hit.n.dataset.card}"]`, off: hit.r.top - top };
}

function correct() {
    if (!anchor || editing()) return;
    const sc = scroller();
    const n = sc.querySelector(anchor.sel);
    if (!n) return;
    const d = n.getBoundingClientRect().top - topOf(sc) - anchor.off;
    if (Math.abs(d) > 1) sc.scrollTop += d;       // scroll event kéo theo sẽ tự chụp lại mốc
}

/** Gọi khi đổi câu: bỏ mốc cũ (nội dung thay hẳn), chụp lại sau khi vẽ xong. */
export function resetScrollHold() {
    anchor = null;
    requestAnimationFrame(capture);
}

export function initScrollHold() {
    if (initScrollHold.done) return;
    initScrollHold.done = true;
    document.addEventListener('scroll', (e) => {
        const sc = scroller();
        if (e.target !== sc && e.target !== document) return;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; capture(); });
    }, { capture: true, passive: true });
    const live = document.getElementById('quiz-live') || document.body;
    new MutationObserver(correct).observe(live, { childList: true, subtree: true, characterData: true });
    // Ảnh / font tải xong cũng làm dịch chỗ mà không đổi DOM
    live.addEventListener('load', correct, true);
    document.fonts?.addEventListener?.('loadingdone', correct);
}
