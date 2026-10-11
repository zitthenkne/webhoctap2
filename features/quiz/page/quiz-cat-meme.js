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

// Meme câu ĐÚNG — 10 GIF đầu của mỗi trang giphy.com/explore/laugh, /explore/dancing, /explore/happy-baby (lấy 2026-10-10)
const HAPPY_CAT_MEMES = [
    'https://media.giphy.com/media/anYBNhqT2BYcg/giphy.gif',
    'https://media.giphy.com/media/fUYhyT9IjftxrxJXcE/giphy.gif',
    'https://media.giphy.com/media/l0ExayQDzrI2xOb8A/giphy.gif',
    'https://media.giphy.com/media/CoDp6NnSmItoY/giphy.gif',
    'https://media.giphy.com/media/3i7zenReaUuI0/giphy.gif',
    'https://media.giphy.com/media/vbqr9NgKRuKq7meXsi/giphy.gif',
    'https://media.giphy.com/media/s5wFafpHxqKbIEERl9/giphy.gif',
    'https://media.giphy.com/media/KgETWyGt3C6Lxs0URG/giphy.gif',
    'https://media.giphy.com/media/IhyGL914g9ShHdHVFy/giphy.gif',
    'https://media.giphy.com/media/3oEjHI8WJv4x6UPDB6/giphy.gif',
    'https://media.giphy.com/media/raHMQ4nj2Ugx2/giphy.gif',
    'https://media.giphy.com/media/8m4R4pvViWtRzbloJ1/giphy.gif',
    'https://media.giphy.com/media/aCB9UFwAw7Nio/giphy.gif',
    'https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif',
    'https://media.giphy.com/media/8pYMOn1sEb43EloTf8/giphy.gif',
    'https://media.giphy.com/media/3o7qE2VAxuXWeyvJIY/giphy.gif',
    'https://media.giphy.com/media/Uowdj8xg3XZ7bKlA1N/giphy.gif',
    'https://media.giphy.com/media/K3Sbp8fOgKye4/giphy.gif',
    'https://media.giphy.com/media/kL1KAdQYmKXle/giphy.gif',
    'https://media.giphy.com/media/MJs7EYwHyG8XC/giphy.gif',
    'https://media.giphy.com/media/l2GsSPkKjx6ZW/giphy.gif',
    'https://media.giphy.com/media/Xw6yFn7frR3Y4/giphy.gif',
    'https://media.giphy.com/media/fyg9iUe1Atm8/giphy.gif',
    'https://media.giphy.com/media/2WofVGJmHSKrpRPhJp/giphy.gif',
    'https://media.giphy.com/media/l41m3YpztVBtugahW/giphy.gif',
    'https://media.giphy.com/media/jYyAvhENR8y5s4MVjp/giphy.gif',
    'https://media.giphy.com/media/BTZZkDu0SVUwn3NEAq/giphy.gif',
    'https://media.giphy.com/media/XI58RM2X0VNX6I3LId/giphy.gif',
    'https://media.giphy.com/media/9cQQ8dARB1gj8Rc59D/giphy.gif',
    'https://media.giphy.com/media/4JCiJFD0XfYQ/giphy.gif'
];
// Meme câu SAI — 10 GIF đầu của mỗi trang giphy.com/explore/sad-baby, /search/sad-cat, /search/sad-dog (lấy 2026-10-10)
const SAD_CAT_MEMES = [
    'https://media.giphy.com/media/fhLgA6nJec3Cw/giphy.gif',
    'https://media.giphy.com/media/CScMUbPKAPeQ8d2nUi/giphy.gif',
    'https://media.giphy.com/media/Y5PnpRvm8PVba/giphy.gif',
    'https://media.giphy.com/media/BLJy2x6QwzgdrCfAlD/giphy.gif',
    'https://media.giphy.com/media/3xz2BYfei21lOMQ6NG/giphy.gif',
    'https://media.giphy.com/media/hmWnkhWgLrx5jRH6Kk/giphy.gif',
    'https://media.giphy.com/media/l0Hee6sB3fXbAdhRK/giphy.gif',
    'https://media.giphy.com/media/UDD1PWeNwS1Co/giphy.gif',
    'https://media.giphy.com/media/4V3RuU0zSq1SC8Hh4x/giphy.gif',
    'https://media.giphy.com/media/avOACDD5vOg71fncY3/giphy.gif',
    'https://media.giphy.com/media/Lz6971fkGSgCMOOncl/giphy.gif',
    'https://media.giphy.com/media/LdMWg0xQTfmcpFF5Yt/giphy.gif',
    'https://media.giphy.com/media/TZBED1pP5m8N2/giphy.gif',
    'https://media.giphy.com/media/CqOaLsqzD7hVUHBaV9/giphy.gif',
    'https://media.giphy.com/media/qzTEbvfPgBOR8nvEUn/giphy.gif',
    'https://media.giphy.com/media/PXQ0tu3SgX8ytZyqYs/giphy.gif',
    'https://media.giphy.com/media/3OhXBaoR1tVPW/giphy.gif',
    'https://media.giphy.com/media/jnvlNj9fDf9MT89rMn/giphy.gif',
    'https://media.giphy.com/media/cbn6M2FbHf3fW/giphy.gif',
    'https://media.giphy.com/media/SD76gausf7LPe7AGfU/giphy.gif',
    'https://media.giphy.com/media/OzlmyoTC2n3aOTXGFi/giphy.gif',
    'https://media.giphy.com/media/3cL541BfVOYrqIysRR/giphy.gif',
    'https://media.giphy.com/media/MuztdWJQ4PR7i/giphy.gif',
    'https://media.giphy.com/media/OrJ4mJFzjstYpb4yE7/giphy.gif',
    'https://media.giphy.com/media/9j6hhcUNPHpfMv6qQC/giphy.gif',
    'https://media.giphy.com/media/UohTsyhfrsPFm/giphy.gif',
    'https://media.giphy.com/media/gvTYmbKCwkaly/giphy.gif',
    'https://media.giphy.com/media/NXgyr1jxOKMDA0ilWO/giphy.gif',
    'https://media.giphy.com/media/IbC4n27fdTUWaEeVOw/giphy.gif',
    'https://media.giphy.com/media/yT7JPIdGb5oJO/giphy.gif'
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
