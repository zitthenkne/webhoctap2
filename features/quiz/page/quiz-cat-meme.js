// File: features/quiz/page/quiz-cat-meme.js
// Meme con mèo: chỉ hiện ảnh meme (đúng = mèo vui, sai = mèo khóc), lấy qua link.
// Mỗi danh sách có nhiều link dự phòng: nếu link đầu lỗi sẽ tự thử link sau,
// hết link thì ẩn luôn nên không bao giờ hiện ảnh vỡ.
// Tách từ quiz-page.js — logic giữ nguyên.

import { state } from '../quiz-state.js';

let _catMemeTimer = null; // hẹn giờ tự ẩn meme con mèo
// GIF đã được tải sẵn cho câu đang xem (để khi trả lời hiện tức thì, không trễ)
let _preloadedMemes = { idx: -1, happy: null, sad: null };
// Loại meme đã HIỆN ở câu trước ('happy'|'sad'): chỉ cái này cần thay+tải mới,
// cái còn lại chưa dùng nên giữ nguyên (khỏi tải lại cả 2).
let _lastConsumed = null;

// Meme câu ĐÚNG (yay/ăn mừng) — 40 GIF từ giphy.com/search/yay (+ hooray/celebrate cho đủ 40)
const HAPPY_CAT_MEMES = [
    'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif',
    'https://media.giphy.com/media/HHzBaXsra2MHciRNQr/giphy.gif',
    'https://media.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif',
    'https://media.giphy.com/media/tAr8T8GTQGn7xycujB/giphy.gif',
    'https://media.giphy.com/media/D2hncA3u88gmeCFeoh/giphy.gif',
    'https://media.giphy.com/media/3ohzAu2U1tOafteBa0/giphy.gif',
    'https://media.giphy.com/media/61MN4zqj333nTdtLEH/giphy.gif',
    'https://media.giphy.com/media/fUQ4rhUZJYiQsas6WD/giphy.gif',
    'https://media.giphy.com/media/pa37AAGzKXoek/giphy.gif',
    'https://media.giphy.com/media/l396FvhXOqm20Pogo/giphy.gif',
    'https://media.giphy.com/media/3og0IuE1EjI5ZQzr3i/giphy.gif',
    'https://media.giphy.com/media/3rgXBxX4myufzT6N2w/giphy.gif',
    'https://media.giphy.com/media/Fo1cy8mqGDvbjpJBB7/giphy.gif',
    'https://media.giphy.com/media/axu6dFuca4HKM/giphy.gif',
    'https://media.giphy.com/media/OfkGZ5H2H3f8Y/giphy.gif',
    'https://media.giphy.com/media/3ov9jEKWFGKZVYsxPy/giphy.gif',
    'https://media.giphy.com/media/VbKLOdvCxBFNZpYvhL/giphy.gif',
    'https://media.giphy.com/media/kalDkPUTRfV4XFEvJ5/giphy.gif',
    'https://media.giphy.com/media/31lPv5L3aIvTi/giphy.gif',
    'https://media.giphy.com/media/aQYR1p8saOQla/giphy.gif',
    'https://media.giphy.com/media/rjkJD1v80CjYs/giphy.gif',
    'https://media.giphy.com/media/TdfyKrN7HGTIY/giphy.gif',
    'https://media.giphy.com/media/AbM71atR2TJQq8c7vw/giphy.gif',
    'https://media.giphy.com/media/inyqrgp9o3NUA/giphy.gif',
    'https://media.giphy.com/media/G1vplGMypxBcp7kx32/giphy.gif',
    'https://media.giphy.com/media/8yYR1O65CgzDc86X4f/giphy.gif',
    'https://media.giphy.com/media/7VuqkWizlQgkdpOllY/giphy.gif',
    'https://media.giphy.com/media/b3LfmXspeGwCSfJh2D/giphy.gif',
    'https://media.giphy.com/media/f67OQljen1ebIjCeU2/giphy.gif',
    'https://media.giphy.com/media/ggfNcf0gq9Lgo3dioO/giphy.gif',
    'https://media.giphy.com/media/Fri0sNjJcsgPHoCI7D/giphy.gif',
    'https://media.giphy.com/media/l378AKyC2pE3eOl0Y/giphy.gif',
    'https://media.giphy.com/media/4xpB3eE00FfBm/giphy.gif',
    'https://media.giphy.com/media/QW5nKIoebG8y4/giphy.gif',
    'https://media.giphy.com/media/cOvgh3VjLmeg8LLBtk/giphy.gif',
    'https://media.giphy.com/media/lSbTmUmQwxUmiExV4h/giphy.gif',
    'https://media.giphy.com/media/gb5Ew2edUemA2w1I7Q/giphy.gif',
    'https://media.giphy.com/media/l4JySAWfMaY7w88sU/giphy.gif',
    'https://media.giphy.com/media/MMFKaXDcVPekc3fyOq/giphy.gif',
    'https://media.giphy.com/media/aj1Osa9Wex6NvsTFST/giphy.gif'
];
// Meme câu SAI (crying/khóc) — 40 GIF từ giphy.com/search/crying (+ sobbing cho đủ 40)
const SAD_CAT_MEMES = [
    'https://media.giphy.com/media/1BXa2alBjrCXC/giphy.gif',
    'https://media.giphy.com/media/pynZagVcYxVUk/giphy.gif',
    'https://media.giphy.com/media/IyjeguAbyZCRJjGdcE/giphy.gif',
    'https://media.giphy.com/media/kaWcPwKBjyC5O/giphy.gif',
    'https://media.giphy.com/media/TU76e2JHkPchG/giphy.gif',
    'https://media.giphy.com/media/10tIjpzIu8fe0/giphy.gif',
    'https://media.giphy.com/media/2WxWfiavndgcM/giphy.gif',
    'https://media.giphy.com/media/3DE8eBtxSQsKc/giphy.gif',
    'https://media.giphy.com/media/5UqMHvCznf56KH0F6K/giphy.gif',
    'https://media.giphy.com/media/13t22jOjxpkAN2/giphy.gif',
    'https://media.giphy.com/media/TpsuCxwsNH8gatbpR5/giphy.gif',
    'https://media.giphy.com/media/6qFFgNgextP9u/giphy.gif',
    'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif',
    'https://media.giphy.com/media/VNTMx3LkpG2anXpwbr/giphy.gif',
    'https://media.giphy.com/media/b8dC9xhIw1VPsnxmCt/giphy.gif',
    'https://media.giphy.com/media/6Q3M4BIK0lX44/giphy.gif',
    'https://media.giphy.com/media/3fmRTfVIKMRiM/giphy.gif',
    'https://media.giphy.com/media/Hwq45iwTIUBGw/giphy.gif',
    'https://media.giphy.com/media/P53TSsopKicrm/giphy.gif',
    'https://media.giphy.com/media/G6IATw3N0jhIc/giphy.gif',
    'https://media.giphy.com/media/lwYxf0qKEjnoI/giphy.gif',
    'https://media.giphy.com/media/qQdL532ZANbjy/giphy.gif',
    'https://media.giphy.com/media/Wvo6vaUsQa3Di/giphy.gif',
    'https://media.giphy.com/media/ADmPjlfvmWBz2/giphy.gif',
    'https://media.giphy.com/media/TW8Ma1a8ZsZ8I/giphy.gif',
    'https://media.giphy.com/media/HHBxDGsPobZGwEsDBp/giphy.gif',
    'https://media.giphy.com/media/YWzWnGcdDSQqYdIoKZ/giphy.gif',
    'https://media.giphy.com/media/xUOxffQgRzFlDtEcGQ/giphy.gif',
    'https://media.giphy.com/media/3oxQNkPwez3jhEHKZW/giphy.gif',
    'https://media.giphy.com/media/xD21kV754DWSsgLao1/giphy.gif',
    'https://media.giphy.com/media/l378tYCFYmDrhBTVe/giphy.gif',
    'https://media.giphy.com/media/cLHUAoqE7XIcYyxZtG/giphy.gif',
    'https://media.giphy.com/media/WOwJ0kQElskmSYPbSN/giphy.gif',
    'https://media.giphy.com/media/ekdras6JwxvY3NxKxC/giphy.gif',
    'https://media.giphy.com/media/BIN2S0sgQwdeE/giphy.gif',
    'https://media.giphy.com/media/pIXoUQrZkO2yWc6JDI/giphy.gif',
    'https://media.giphy.com/media/6v2UJRyFAsTXgvJrin/giphy.gif',
    'https://media.giphy.com/media/CFJzEKHnTknlqG01Hr/giphy.gif',
    'https://media.giphy.com/media/XjxgUV6B8uCzARN4iD/giphy.gif',
    'https://media.giphy.com/media/VbEC9WchxkiWTL5PFo/giphy.gif'
];

// Người dùng có thể tắt meme ở trang thiết lập; lựa chọn lưu cục bộ (mặc định BẬT).
export function getCatMemeEnabled() {
    try { return localStorage.getItem('quiz_meme_enabled') !== '0'; } catch (e) { return true; }
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Chọn sẵn 1 GIF đúng + 1 GIF sai cho câu hiện tại và tải trước vào cache trình duyệt,
// để khi người dùng trả lời thì meme hiện ra ngay (đỡ phải chờ tải GIF nặng).
export function preloadCurrentMemes() {
    if (!getCatMemeEnabled()) return;
    const idx = state.currentIndex;
    if (_preloadedMemes.idx === idx && _preloadedMemes.happy && _preloadedMemes.sad) return;
    // Giữ lại meme CHƯA hiện ở câu trước (vẫn còn tải sẵn), chỉ chọn+tải mới cái đã dùng.
    let happy = _preloadedMemes.happy;
    let sad = _preloadedMemes.sad;
    const toLoad = [];
    if (!happy || _lastConsumed === 'happy') { happy = pickRandom(HAPPY_CAT_MEMES); toLoad.push(happy); }
    if (!sad || _lastConsumed === 'sad') { sad = pickRandom(SAD_CAT_MEMES); toLoad.push(sad); }
    _preloadedMemes = { idx, happy, sad };
    _lastConsumed = null;
    toLoad.forEach(u => { try { const im = new Image(); im.src = u; } catch (e) {} });
}

// Đồng bộ trạng thái BẬT/TẮT meme lên cả 2 nơi: công tắc trong bảng điều khiển khi
// đang làm bài (#qs-meme) và ô gạt ở trang thiết lập (#meme-enabled-checkbox).
export function syncMemeControls() {
    const on = getCatMemeEnabled();
    const row = document.getElementById('qs-meme');
    if (row) row.setAttribute('aria-checked', String(on));
    const cb = document.getElementById('meme-enabled-checkbox');
    if (cb) cb.checked = on;
}
export function setMemeEnabled(on) {
    try { localStorage.setItem('quiz_meme_enabled', on ? '1' : '0'); } catch (e) {}
    syncMemeControls();
    if (on) preloadCurrentMemes();
    else hideCatMeme();
}

export function hideCatMeme() {
    const el = document.getElementById('cat-meme-pop');
    if (!el) return;
    if (_catMemeTimer) { clearTimeout(_catMemeTimer); _catMemeTimer = null; }
    el.classList.remove('show');
    _catMemeTimer = setTimeout(() => {
        el.classList.add('hidden');
        // Xóa luôn ảnh đang giữ để giải phóng RAM khi meme đã ẩn
        // (byte GIF vẫn nằm trong HTTP cache của trình duyệt nên lần sau vẫn hiện nhanh)
        const img = el.querySelector('.cat-meme-img');
        if (img) { img.onload = null; img.onerror = null; img.removeAttribute('src'); }
    }, 240);
}

export function showCatMeme(isCorrect) {
    if (!getCatMemeEnabled()) return; // người dùng đã tắt meme
    _lastConsumed = isCorrect ? 'happy' : 'sad'; // câu sau chỉ tải lại đúng loại này
    let el = document.getElementById('cat-meme-pop');
    if (!el) {
        el = document.createElement('div');
        el.id = 'cat-meme-pop';
        el.className = 'hidden';
        el.innerHTML = `<img class="cat-meme-img" alt="Meme phản hồi" />`;
        document.body.appendChild(el);
        // Bấm ra ngoài (hoặc vào) meme là ẩn ngay
        el.addEventListener('click', hideCatMeme);
    }
    if (_catMemeTimer) { clearTimeout(_catMemeTimer); _catMemeTimer = null; }

    // Ẩn NGAY ảnh của câu trước để không lóe meme cũ trong lúc GIF mới đang tải
    el.classList.remove('show');
    const img = el.querySelector('.cat-meme-img');
    img.onload = null;
    img.onerror = null;
    img.style.visibility = 'hidden';
    img.removeAttribute('src');

    // Ưu tiên GIF đã tải sẵn cho câu này (hiện tức thì); phần còn lại xáo trộn làm dự phòng.
    const preferred = (_preloadedMemes.idx === state.currentIndex)
        ? (isCorrect ? _preloadedMemes.happy : _preloadedMemes.sad) : null;
    let candidates = (isCorrect ? HAPPY_CAT_MEMES : SAD_CAT_MEMES)
        .map(u => ({ u, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(o => o.u);
    if (preferred) candidates = [preferred, ...candidates.filter(u => u !== preferred)];
    // Thêm tham số ngẫu nhiên cho cataas để mỗi lần là một chú mèo khác (tránh cache)
    candidates = candidates.map(u => u.includes('cataas') ? u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random().toString(36).slice(2) : u);
    let i = 0;

    // Chỉ hiện popup KHI GIF mới đã tải xong -> không bao giờ thấy meme của câu trước
    const reveal = () => {
        img.style.visibility = '';
        el.classList.remove('hidden');
        requestAnimationFrame(() => el.classList.add('show'));
        if (_catMemeTimer) clearTimeout(_catMemeTimer);
        _catMemeTimer = setTimeout(hideCatMeme, 2600);
    };
    img.onload = reveal;
    img.onerror = () => {
        i++;
        if (i < candidates.length) img.src = candidates[i];
        else { img.onerror = null; img.onload = null; hideCatMeme(); } // hết link dự phòng -> ẩn luôn
    };
    img.src = candidates[0];
}
