// File: features/quiz/page/quiz-cat-meme.js
// Meme con mèo: chỉ hiện ảnh meme (đúng = mèo vui, sai = mèo khóc), lấy qua link.
// Mỗi danh sách có nhiều link dự phòng: nếu link đầu lỗi sẽ tự thử link sau,
// hết link thì ẩn luôn nên không bao giờ hiện ảnh vỡ.
// Tách từ quiz-page.js — logic giữ nguyên.

import { state } from '../quiz-state.js';

let _catMemeTimer = null; // hẹn giờ tự ẩn meme con mèo
// GIF đã được tải sẵn cho câu đang xem (để khi trả lời hiện tức thì, không trễ)
let _preloadedMemes = { idx: -1, happy: null, sad: null };

// Meme câu ĐÚNG (happy cat) — 20 GIF từ giphy.com/search/happy-cat
const HAPPY_CAT_MEMES = [
    'https://media.giphy.com/media/QaO94TsFEnZauKsboY/giphy.gif',
    'https://media.giphy.com/media/LDI8pqI24xe6wxRWuF/giphy.gif',
    'https://media.giphy.com/media/PleihcHr0kbJVD0bNe/giphy.gif',
    'https://media.giphy.com/media/td5eq6qlu1UL6/giphy.gif',
    'https://media.giphy.com/media/BK1EfIsdkKZMY/giphy.gif',
    'https://media.giphy.com/media/gT93oBucqsHNS/giphy.gif',
    'https://media.giphy.com/media/W8hVGGjOjV82Rh6Oyi/giphy.gif',
    'https://media.giphy.com/media/Rtu8Jzs4MzoC3cl8lM/giphy.gif',
    'https://media.giphy.com/media/T70hpBP1L0N7U0jtkq/giphy.gif',
    'https://media.giphy.com/media/GAtTF1kUyoMFx2QL7n/giphy.gif',
    'https://media.giphy.com/media/kalDkPUTRfV4XFEvJ5/giphy.gif',
    'https://media.giphy.com/media/1rzHSymOFmy0Do1Mb0/giphy.gif',
    'https://media.giphy.com/media/NfzERYyiWcXU4/giphy.gif',
    'https://media.giphy.com/media/wvYNSqBAMDVx8CEYkt/giphy.gif',
    'https://media.giphy.com/media/Yt09iFvD9u5AQ/giphy.gif',
    'https://media.giphy.com/media/HJibfnd7xqk5hAMD4v/giphy.gif',
    'https://media.giphy.com/media/gZFHLPFHNpjwaondsz/giphy.gif',
    'https://media.giphy.com/media/NPwRSSWKyXkbxl8SaX/giphy.gif',
    'https://media.giphy.com/media/wXbyhZ5mWQmv7c672G/giphy.gif',
    'https://media.giphy.com/media/GRC8pK6FJ9Nm3AFArf/giphy.gif'
];
// Meme câu SAI (confused) — 20 GIF từ giphy.com/search/confused
const SAD_CAT_MEMES = [
    'https://media.giphy.com/media/ji6zzUZwNIuLS/giphy.gif',
    'https://media.giphy.com/media/gKHGnB1ml0moQdjhEJ/giphy.gif',
    'https://media.giphy.com/media/ukGm72ZLZvYfS/giphy.gif',
    'https://media.giphy.com/media/fa1AV8UvZvfBFOIt7F/giphy.gif',
    'https://media.giphy.com/media/fFwOzwhCO1FMA/giphy.gif',
    'https://media.giphy.com/media/xRq2Mo2yewajZLPmCt/giphy.gif',
    'https://media.giphy.com/media/hv53DaYcXWe3nRbR1A/giphy.gif',
    'https://media.giphy.com/media/lkdH8FmImcGoylv3t3/giphy.gif',
    'https://media.giphy.com/media/5M5N7Rc0y2NkJWEarU/giphy.gif',
    'https://media.giphy.com/media/lHfxDepSGlzom6f65K/giphy.gif',
    'https://media.giphy.com/media/H4zeDO4ocDYqY/giphy.gif',
    'https://media.giphy.com/media/Z5xk7fGO5FjjTElnpT/giphy.gif',
    'https://media.giphy.com/media/WRQBXSCnEFJIuxktnw/giphy.gif',
    'https://media.giphy.com/media/YVPwi7L2izTJS/giphy.gif',
    'https://media.giphy.com/media/YaXDLHHbz0t5lTM03z/giphy.gif',
    'https://media.giphy.com/media/3o7aCTPPm4OHfRLSH6/giphy.gif',
    'https://media.giphy.com/media/3EiNpweH34XGoQcq9Q/giphy.gif',
    'https://media.giphy.com/media/a0FuPjiLZev4c/giphy.gif',
    'https://media.giphy.com/media/iHe7mA9M9SsyQ/giphy.gif',
    'https://media.giphy.com/media/FY8c5SKwiNf1EtZKGs/giphy.gif'
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
    const happy = pickRandom(HAPPY_CAT_MEMES);
    const sad = pickRandom(SAD_CAT_MEMES);
    _preloadedMemes = { idx, happy, sad };
    [happy, sad].forEach(u => { try { const im = new Image(); im.src = u; } catch (e) {} });
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
