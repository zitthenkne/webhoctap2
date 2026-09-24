// room-mobile.js — giao diện điện thoại: dock đáy một tầng + các khay trượt.
// Ý tưởng: màn chính chỉ để CÂU HỎI · PHƯƠNG ÁN · BẢNG PHIẾU; ghi chú, giải thích,
// thảo luận, thanh chủ trì và menu đều nằm trong khay, mở ra mới thấy.
// Khay không hề dời DOM — chỉ bật/tắt class trên <body> rồi CSS lo phần trượt lên,
// nhờ vậy mọi listener sẵn có của các module khác vẫn chạy nguyên.
import { room, hasSession, canControl, isShown } from './room-state.js';
import { effectiveIndex, setViewIndex } from './room-quiz-stage.js';
import { focusHub } from './room-answer.js';

const el = (id) => document.getElementById(id);
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

// 'tools' = cột ghi chú/giải thích · 'host' = thanh chủ trì · 'more' = menu · 'panel' = bảng bên
let openSheet = null;
const SHEET_KEY = 'roomSheetH';                    // chiều cao khay người dùng đã kéo (px)

const sheetNode = () => (
    openSheet === 'tools' ? document.querySelector('.rm-col-side')
    : openSheet === 'host' ? el('host-bar')
    : openSheet === 'more' ? el('m-more')
    : openSheet === 'panel' ? el('side-panel')
    : null
);

function clearSheetSize(node) {
    if (!node) return;
    node.style.height = '';
    node.style.maxHeight = '';
}

function closeSheet() {
    clearSheetSize(sheetNode());
    document.body.classList.remove('sheet-tools', 'sheet-host');
    el('m-more')?.classList.add('hidden');
    el('m-scrim')?.classList.add('hidden');
    const panel = el('side-panel');
    if (panel && isPhone()) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
    openSheet = null;
    paintDock();
}

function showSheet(name) {
    if (openSheet === name) return closeSheet();
    closeSheet();
    openSheet = name;
    el('m-scrim')?.classList.remove('hidden');
    if (name === 'tools') document.body.classList.add('sheet-tools');
    else if (name === 'host') document.body.classList.add('sheet-host');
    else if (name === 'more') el('m-more')?.classList.remove('hidden');
    if (name !== 'more') {                          // menu Thêm ngắn, cứ để tự co
        let h = 0;
        try { h = Number(localStorage.getItem(SHEET_KEY)) || 0; } catch (e) {}
        const node = sheetNode();
        if (h && node) { node.style.maxHeight = 'none'; node.style.height = h + 'px'; }
    }
    paintDock();
}

// ---------- Kéo tay nắm để đổi chiều cao khay ----------
function initSheetDrag() {
    let node = null, y0 = 0, h0 = 0;

    document.addEventListener('pointerdown', (e) => {
        const grip = e.target.closest?.('.rm-sheet-grip');
        if (!grip || !isPhone() || !openSheet) return;
        node = sheetNode();
        if (!node) return;
        e.preventDefault();
        grip.classList.add('is-drag');
        try { grip.setPointerCapture?.(e.pointerId); } catch (err) {}   // con trỏ giả lập có thể ném lỗi
        y0 = e.clientY;
        h0 = node.getBoundingClientRect().height;
        node.style.transition = 'none';
        node.style.maxHeight = 'none';
        node.style.height = h0 + 'px';
    });

    document.addEventListener('pointermove', (e) => {
        if (!node) return;
        const max = window.innerHeight * 0.92;
        const h = Math.max(90, Math.min(max, h0 + (y0 - e.clientY)));
        node.style.height = h + 'px';
    });

    const done = () => {
        document.querySelectorAll('.rm-sheet-grip.is-drag').forEach(g => g.classList.remove('is-drag'));
        if (!node) return;
        node.style.transition = '';
        const h = node.getBoundingClientRect().height;
        const cur = node;
        node = null;
        if (h < 150) {                              // kéo tụt xuống thì coi như đóng
            clearSheetSize(cur);
            return closeSheet();
        }
        if (openSheet !== 'more') {                 // menu Thêm ngắn, đừng lấy nó làm chuẩn cho khay khác
            try { localStorage.setItem(SHEET_KEY, String(Math.round(h))); } catch (e) {}
        }
    };
    document.addEventListener('pointerup', done);
    document.addEventListener('pointercancel', done);
}

/** Dock phải hợp cảnh: sảnh chờ khác lúc đang làm bài, chủ trì mới có nút chủ trì. */
export function paintDock() {
    document.body.classList.toggle('has-quiz', hasSession() && !room.session?.ended);
    document.body.classList.toggle('on-board', !el('stage-board')?.classList.contains('hidden'));
    document.body.classList.toggle('is-host', canControl());
    const c = el('dock-counter');
    if (c && hasSession()) c.textContent = `Câu ${effectiveIndex() + 1}/${room.session.questions.length}`;
    // Khay "Ghi chú" nay chỉ còn ghi chú riêng + báo lỗi đề: phần đáp án & bàn luận đã nằm
    // ngay dưới phương án (room-answer.js) nên khỏi đổi nhãn "Giải thích" như trước.
    document.querySelectorAll('#mobile-nav [data-m]').forEach(b => {
        const k = b.dataset.m;
        const on = (k === 'tools' && openSheet === 'tools')
            || (k === 'host' && openSheet === 'host')
            || (k === 'more' && openSheet === 'more')
            || (k === 'chat' && openSheet === 'panel');
        b.classList.toggle('is-on', on);
    });
}

function openPanelSheet(name) {
    if (openSheet === 'panel' && !el('side-panel').classList.contains('hidden')) return closeSheet();
    closeSheet();
    openSheet = 'panel';
    el('m-scrim')?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('room:panel', { detail: name }));
    paintDock();
}

export function initMobile() {
    window.addEventListener('room:chat-sheet', () => openPanelSheet('discuss'));
    // --- Dock ---
    el('mobile-nav')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        const k = b.dataset.m;
        if (k === 'prev' || k === 'next') {
            closeSheet();
            return setViewIndex(effectiveIndex() + (k === 'next' ? 1 : -1));
        }
        if (k === 'jump') {
            // Chặn cú bấm nổi lên document: bộ đóng-khi-bấm-ra-ngoài (room-quiz-stage.js)
            // thấy đích là nút dock -> đóng ngay bản đồ vừa mở (lỗi cũ: bấm "Câu x/y" không lên gì).
            e.stopPropagation();
            closeSheet();
            return void el('question-pill')?.click();
        }
        // Đang làm bài: "Bàn luận" đưa thẳng tới khối Đáp án & bàn luận ngay dưới đề (chỗ bàn chính),
        // chat tự do vẫn mở được từ nút "Chat" trong khối đó. Ở sảnh chờ vẫn là khay chat.
        if (k === 'chat' && document.body.classList.contains('has-quiz') && el('stage-quiz') && !el('stage-quiz').classList.contains('hidden')) {
            closeSheet();
            if (focusHub()) return;
        }
        if (k === 'chat' || k === 'members' || k === 'rank') return openPanelSheet({ chat: 'discuss', members: 'members', rank: 'rank' }[k]);
        if (k === 'toquiz') {
            closeSheet();
            return void document.querySelector('#stage-tabs [data-stage="quiz"]')?.click();
        }
        if (k === 'tools' || k === 'host' || k === 'more') return showSheet(k);
    });

    // --- Menu "Thêm" ---
    el('m-more')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-more]');
        if (!b) return;
        const k = b.dataset.more;
        closeSheet();
        if (k === 'board' || k === 'quiz') return void document.querySelector(`#stage-tabs [data-stage="${k}"]`)?.click();
        if (k === 'chat') return void openPanelSheet('discuss');
        if (k === 'members' || k === 'rank') return void window.dispatchEvent(new CustomEvent('room:panel', { detail: k }));
        if (k === 'invite') return void el('share-room-btn')?.click();
        if (k === 'find' || k === 'sound' || k === 'minutes') return void window.dispatchEvent(new CustomEvent('room:tool', { detail: k }));
        if (k === 'text') return void el('text-size-btn')?.click();
        if (k === 'theme') return void el('theme-btn')?.click();
        if (k === 'race') return void window.dispatchEvent(new CustomEvent('room:tool', { detail: 'race' }));
    });

    // Dải tiến độ nhóm mặc định gập còn 1 dòng (cả máy tính lẫn điện thoại) -> chạm dòng đó
    // để xổ đường đua ra; nhớ theo máy. (Nút con mắt bên trong vẫn là "ẩn hẳn dải".)
    try { document.body.classList.toggle('race-open', localStorage.getItem('roomRaceOpen') === '1'); } catch (e) {}
    document.addEventListener('click', (e) => {
        if (!(e.target.closest('.rm-race-top') || e.target.closest('[data-race-open]')) || e.target.closest('[data-race-toggle]')) return;
        const open = document.body.classList.toggle('race-open');
        try { localStorage.setItem('roomRaceOpen', open ? '1' : '0'); } catch (err) {}
    });

    el('stage-tabs')?.addEventListener('click', () => setTimeout(paintDock, 0));
    el('m-scrim')?.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheet) closeSheet(); });
    // Nút X trong bảng bên đóng luôn lớp mờ
    el('close-panel-btn')?.addEventListener('click', closeSheet);

    // --- Vuốt ngang để đổi câu ---
    let x0 = null, y0 = null, skip = false;
    const stage = el('stage-quiz');
    stage?.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || !hasSession()) return;
        const t = e.target;
        // đừng cướp thao tác của vùng cuộn ngang / ô đang gõ
        skip = !!(t.closest?.('[contenteditable]') || t.closest?.('.rm-qtrack') || t.closest?.('.rm-emoji-bar') || t.closest?.('.rm-quick-bar'));
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
    }, { passive: true });
    stage?.addEventListener('touchend', (e) => {
        if (x0 === null || skip) { x0 = null; return; }
        const t = e.changedTouches[0];
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        x0 = null;
        if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        setViewIndex(effectiveIndex() + (dx < 0 ? 1 : -1));
    }, { passive: true });

    initSheetDrag();
    paintDock();
}
