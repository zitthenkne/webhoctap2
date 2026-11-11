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

// Dùng bản 200w.webp (rộng 200px, động) thay giphy.gif gốc: trung bình 175 KB thay vì 1,5 MB (đo 2026-11-11).
// GIF gốc từng ngốn hết băng thông mạng yếu + giải mã nặng -> giật khi cuộn / chuyển câu / chọn đáp án.
// Meme câu ĐÚNG — 10 GIF đầu của mỗi trang giphy.com/explore/laugh, /explore/dancing, /explore/happy-baby (lấy 2026-10-10)
const HAPPY_CAT_MEMES = [
    'https://media.giphy.com/media/anYBNhqT2BYcg/200w.webp',
    'https://media.giphy.com/media/fUYhyT9IjftxrxJXcE/200w.webp',
    'https://media.giphy.com/media/l0ExayQDzrI2xOb8A/200w.webp',
    'https://media.giphy.com/media/CoDp6NnSmItoY/200w.webp',
    'https://media.giphy.com/media/3i7zenReaUuI0/200w.webp',
    'https://media.giphy.com/media/vbqr9NgKRuKq7meXsi/200w.webp',
    'https://media.giphy.com/media/s5wFafpHxqKbIEERl9/200w.webp',
    'https://media.giphy.com/media/KgETWyGt3C6Lxs0URG/200w.webp',
    'https://media.giphy.com/media/IhyGL914g9ShHdHVFy/200w.webp',
    'https://media.giphy.com/media/3oEjHI8WJv4x6UPDB6/200w.webp',
    'https://media.giphy.com/media/raHMQ4nj2Ugx2/200w.webp',
    'https://media.giphy.com/media/8m4R4pvViWtRzbloJ1/200w.webp',
    'https://media.giphy.com/media/aCB9UFwAw7Nio/200w.webp',
    'https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/200w.webp',
    'https://media.giphy.com/media/8pYMOn1sEb43EloTf8/200w.webp',
    'https://media.giphy.com/media/3o7qE2VAxuXWeyvJIY/200w.webp',
    'https://media.giphy.com/media/Uowdj8xg3XZ7bKlA1N/200w.webp',
    'https://media.giphy.com/media/K3Sbp8fOgKye4/200w.webp',
    'https://media.giphy.com/media/kL1KAdQYmKXle/200w.webp',
    'https://media.giphy.com/media/MJs7EYwHyG8XC/200w.webp',
    'https://media.giphy.com/media/l2GsSPkKjx6ZW/200w.webp',
    'https://media.giphy.com/media/Xw6yFn7frR3Y4/200w.webp',
    'https://media.giphy.com/media/fyg9iUe1Atm8/200w.webp',
    'https://media.giphy.com/media/2WofVGJmHSKrpRPhJp/200w.webp',
    'https://media.giphy.com/media/l41m3YpztVBtugahW/200w.webp',
    'https://media.giphy.com/media/jYyAvhENR8y5s4MVjp/200w.webp',
    'https://media.giphy.com/media/BTZZkDu0SVUwn3NEAq/200w.webp',
    'https://media.giphy.com/media/XI58RM2X0VNX6I3LId/200w.webp',
    'https://media.giphy.com/media/9cQQ8dARB1gj8Rc59D/200w.webp',
    'https://media.giphy.com/media/4JCiJFD0XfYQ/200w.webp'
];
// Meme câu SAI — 10 GIF đầu của mỗi trang giphy.com/explore/sad-baby, /search/sad-cat, /search/sad-dog (lấy 2026-10-10)
const SAD_CAT_MEMES = [
    'https://media.giphy.com/media/fhLgA6nJec3Cw/200w.webp',
    'https://media.giphy.com/media/CScMUbPKAPeQ8d2nUi/200w.webp',
    'https://media.giphy.com/media/Y5PnpRvm8PVba/200w.webp',
    'https://media.giphy.com/media/BLJy2x6QwzgdrCfAlD/200w.webp',
    'https://media.giphy.com/media/3xz2BYfei21lOMQ6NG/200w.webp',
    'https://media.giphy.com/media/hmWnkhWgLrx5jRH6Kk/200w.webp',
    'https://media.giphy.com/media/l0Hee6sB3fXbAdhRK/200w.webp',
    'https://media.giphy.com/media/UDD1PWeNwS1Co/200w.webp',
    'https://media.giphy.com/media/4V3RuU0zSq1SC8Hh4x/200w.webp',
    'https://media.giphy.com/media/avOACDD5vOg71fncY3/200w.webp',
    'https://media.giphy.com/media/Lz6971fkGSgCMOOncl/200w.webp',
    'https://media.giphy.com/media/LdMWg0xQTfmcpFF5Yt/200w.webp',
    'https://media.giphy.com/media/TZBED1pP5m8N2/200w.webp',
    'https://media.giphy.com/media/CqOaLsqzD7hVUHBaV9/200w.webp',
    'https://media.giphy.com/media/qzTEbvfPgBOR8nvEUn/200w.webp',
    'https://media.giphy.com/media/PXQ0tu3SgX8ytZyqYs/200w.webp',
    'https://media.giphy.com/media/3OhXBaoR1tVPW/200w.webp',
    'https://media.giphy.com/media/jnvlNj9fDf9MT89rMn/200w.webp',
    'https://media.giphy.com/media/cbn6M2FbHf3fW/200w.webp',
    'https://media.giphy.com/media/SD76gausf7LPe7AGfU/200w.webp',
    'https://media.giphy.com/media/OzlmyoTC2n3aOTXGFi/200w.webp',
    'https://media.giphy.com/media/3cL541BfVOYrqIysRR/200w.webp',
    'https://media.giphy.com/media/MuztdWJQ4PR7i/200w.webp',
    'https://media.giphy.com/media/OrJ4mJFzjstYpb4yE7/200w.webp',
    'https://media.giphy.com/media/9j6hhcUNPHpfMv6qQC/200w.webp',
    'https://media.giphy.com/media/UohTsyhfrsPFm/200w.webp',
    'https://media.giphy.com/media/gvTYmbKCwkaly/200w.webp',
    'https://media.giphy.com/media/NXgyr1jxOKMDA0ilWO/200w.webp',
    'https://media.giphy.com/media/IbC4n27fdTUWaEeVOw/200w.webp',
    'https://media.giphy.com/media/yT7JPIdGb5oJO/200w.webp'
];

// Người dùng có thể tắt meme ở trang thiết lập; lựa chọn lưu cục bộ (mặc định BẬT).
export function getCatMemeEnabled() {
    try { return localStorage.getItem('quiz_meme_enabled') !== '0'; } catch (e) { return true; }
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Mạng 2G / bật Tiết kiệm dữ liệu (Chrome/Android báo được): bỏ meme, nhường mạng cho bài làm.
function slowNet() {
    const c = navigator.connection;
    return !!(c && (c.saveData || /2g/.test(c.effectiveType || '')));
}
// Meme tải quá mốc này thì bỏ (hủy tải luôn) — hiện muộn khi đã đọc sang chỗ khác chỉ gây giật.
const MEME_LOAD_MS = 1500;

// Chọn sẵn 1 GIF đúng + 1 GIF sai cho câu hiện tại và tải trước vào cache trình duyệt,
// để khi người dùng trả lời thì meme hiện ra ngay (đỡ phải chờ tải GIF nặng).
export function preloadCurrentMemes() {
    if (!getCatMemeEnabled() || slowNet()) return;
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
    if (!getCatMemeEnabled() || slowNet()) return; // người dùng đã tắt meme / mạng quá yếu
    _lastConsumed = isCorrect ? 'happy' : 'sad'; // câu sau chỉ tải lại đúng loại này
    let el = document.getElementById('cat-meme-pop');
    if (!el) {
        el = document.createElement('div');
        el.id = 'cat-meme-pop';
        el.className = 'hidden';
        el.innerHTML = `<img class="cat-meme-img" alt="Meme phản hồi" />`;
        document.body.appendChild(el);
        // Bấm vào ảnh là ẩn ngay; bấm ra NGOÀI cũng ẩn nhưng cú bấm vẫn đi tiếp tới nút bên dưới (lớp phủ không chặn chạm, xem quiz-enhance.css)
        el.addEventListener('click', hideCatMeme);
        document.addEventListener('pointerdown', () => { if (el.classList.contains('show')) hideCatMeme(); }, { capture: true, passive: true });
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
    // Hết hạn chờ mà chưa hiện được ảnh nào -> ẩn (hideCatMeme gỡ src = hủy tải). reveal() xóa hẹn giờ này.
    _catMemeTimer = setTimeout(hideCatMeme, MEME_LOAD_MS);
    img.src = candidates[0];
}
