// room-media.js — ảnh trong phòng đánh đề: NÉN tại máy rồi tải lên host ảnh MIỄN PHÍ bên ngoài.
// Firestore chỉ giữ đường link (không nhúng base64) -> tin nhắn / giải thích nhẹ, máy yếu vẫn mượt.
//
// Chuỗi dự phòng — host nào lỗi / quá 25s thì thử host kế tiếp:
//   1. imgbb      — chỉ khi có khóa (hằng IMGBB_KEY bên dưới hoặc localStorage.roomImgbbKey), vĩnh viễn
//   2. sxcu.net   — ẩn danh, vĩnh viễn, có CORS (link ảnh = url + đuôi tệp)
//   3. litterbox  — ẩn danh nhưng ẢNH TẠM 72 giờ (nhánh tạm của catbox.moe)
//   4. nhúng thẳng — ảnh nén ≤ 160KB, khi mọi host đều không với tới (mất mạng / bị chặn)
// catbox.moe bản vĩnh viễn KHÔNG dùng được: API không trả header CORS nên trình duyệt tải
// lên được nhưng không đọc được link trả về (đã thử 2026-09-23). freeimage.host cũng vậy.
//
// LƯU Ý: ảnh trên host công khai theo link — ai có link đều xem được.

import { showToast } from '../../core/utils.js';

/** Khóa API imgbb (miễn phí tại api.imgbb.com). Để trống thì bỏ qua imgbb. */
export const IMGBB_KEY = '';
const imgbbKey = () => { try { return localStorage.getItem('roomImgbbKey') || IMGBB_KEY; } catch (e) { return IMGBB_KEY; } };

const MAX_SIDE = 1600;          // cạnh dài tối đa — đủ đọc chữ trong ảnh chụp sách / slide
const TIMEOUT = 25000;
const INLINE_MAX = 160 * 1024;  // nhúng thẳng chỉ khi đủ nhỏ (1 tài liệu Firestore tối đa 1MB)
const skipUntil = Object.create(null);   // host vừa lỗi -> nghỉ 5 phút cho đỡ chờ

/** Lấy ảnh từ clipboardData / dataTransfer (Ctrl+V, kéo thả, chọn tệp). */
export function imageFilesOf(dt) {
    const out = [];
    if (!dt) return out;
    for (const f of dt.files || []) if (f.type?.startsWith('image/')) out.push(f);
    if (!out.length) {
        for (const it of dt.items || []) {
            if (it.kind === 'file' && it.type.startsWith('image/')) {
                const f = it.getAsFile();
                if (f) out.push(f);
            }
        }
    }
    return out;
}

/** Chỉ nhận link https hoặc ảnh nhúng — chặn javascript:, http: trần… */
export const safeImgUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(u || '') || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(u || '')) ? u : '';

// ---------- Nén ----------
async function compress(file) {
    if (file.type === 'image/gif' && file.size < 4e6) return { blob: file, ext: 'gif' };   // giữ ảnh động
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await createImageBitmap(file); }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';                 // ảnh PNG trong suốt (sơ đồ chụp màn hình) -> nền trắng, khỏi đen
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const jpg = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
    // Ảnh gốc đã nhỏ mà nén lại còn to hơn (ảnh chụp màn hình ít màu) -> giữ bản gốc cho nét
    if (scale === 1 && /image\/(png|jpeg|webp)/.test(file.type) && file.size <= (jpg?.size || Infinity)) {
        return { blob: file, ext: file.type.split('/')[1].replace('jpeg', 'jpg'), w, h };
    }
    return { blob: jpg, ext: 'jpg', w, h };
}

// ---------- Tải lên (XHR để có % tiến độ) ----------
function post(url, form, onProgress) {
    return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('POST', url);
        x.timeout = TIMEOUT;
        x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        x.onload = () => (x.status >= 200 && x.status < 300)
            ? resolve(x.responseText)
            : reject(new Error(`HTTP ${x.status}: ${String(x.responseText).slice(0, 120)}`));
        x.onerror = () => reject(new Error('network'));
        x.ontimeout = () => reject(new Error('timeout'));
        x.send(form);
    });
}

const HOSTS = [
    {
        name: 'imgbb', on: () => !!imgbbKey(),
        async up(blob, ext, p) {
            const f = new FormData();
            f.append('image', blob, 'anh.' + ext);
            const j = JSON.parse(await post(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbKey())}`, f, p));
            if (!j?.data?.url) throw new Error(j?.error?.message || 'imgbb');
            return { url: j.data.url };
        },
    },
    {
        name: 'sxcu', on: () => true,
        async up(blob, ext, p) {
            const f = new FormData();
            f.append('file', blob, 'anh.' + ext);
            const j = JSON.parse(await post('https://sxcu.net/api/files/create', f, p));
            if (!j?.url) throw new Error(j?.error || 'sxcu');
            return { url: `${j.url}.${ext}` };          // j.url là trang xem; thêm đuôi = link ảnh trực tiếp
        },
    },
    {
        name: 'litterbox', on: () => true,
        async up(blob, ext, p) {
            const f = new FormData();
            f.append('reqtype', 'fileupload');
            f.append('time', '72h');
            f.append('fileToUpload', blob, 'anh.' + ext);
            const t = String(await post('https://litterbox.catbox.moe/resources/internals/api.php', f, p)).trim();
            if (!/^https:\/\/\S+$/.test(t)) throw new Error(t.slice(0, 80));
            return { url: t, temp: 1 };
        },
    },
];

const toDataUrl = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
});

/**
 * Nén + tải một ảnh. Trả về { u, t?, w?, h? } — u = link ảnh, t = 1 nếu là ảnh tạm 72 giờ,
 * i = 1 nếu phải nhúng thẳng. onProgress(0..1).
 */
export async function uploadImage(file, onProgress) {
    if (!file?.type?.startsWith('image/')) throw new Error('not-image');
    const { blob, ext, w, h } = await compress(file);
    onProgress?.(0.05);
    let lastErr = null;
    for (const host of HOSTS) {
        if (!host.on() || skipUntil[host.name] > Date.now()) continue;
        try {
            const res = await host.up(blob, ext, (x) => onProgress?.(0.05 + 0.9 * x));
            onProgress?.(1);
            return { u: res.url, ...(res.temp ? { t: 1 } : {}), ...(w ? { w, h } : {}) };
        } catch (err) {
            lastErr = err;
            console.warn(`[ảnh] ${host.name} lỗi, thử host khác:`, err?.message || err);
            skipUntil[host.name] = Date.now() + 5 * 60 * 1000;
        }
    }
    if (blob.size <= INLINE_MAX) {
        onProgress?.(1);
        return { u: await toDataUrl(blob), i: 1, ...(w ? { w, h } : {}) };
    }
    throw lastErr || new Error('upload-failed');
}

/** Báo nhẹ nếu ảnh không nằm trên host vĩnh viễn. */
export function warnIfTemp(res) {
    if (res?.t) showToast('Host chính đang lỗi — ảnh lưu TẠM 72 giờ. Muốn giữ lâu thì tải lại sau.', 'warning', 5200);
    else if (res?.i) showToast('Không với tới host ảnh — đã nén và nhúng thẳng ảnh (bản nhỏ).', 'info', 4200);
}

// ---------- Xem ảnh phóng to ----------
export function openLightbox(src, caption = '') {
    const url = safeImgUrl(src);
    if (!url) return;
    let box = document.getElementById('rm-lightbox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'rm-lightbox';
        box.className = 'rm-lightbox';
        box.innerHTML = `<button class="rm-lb-x" aria-label="Đóng"><i class="fas fa-times"></i></button>
            <img alt=""><p class="rm-lb-cap"></p>
            <a class="rm-lb-open" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square"></i> Mở ảnh gốc</a>`;
        box.addEventListener('click', (e) => { if (!e.target.closest('.rm-lb-open')) box.classList.remove('on'); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('on'); });
        document.body.appendChild(box);
    }
    box.querySelector('img').src = url;
    box.querySelector('.rm-lb-cap').textContent = caption;
    const open = box.querySelector('.rm-lb-open');
    open.classList.toggle('hidden', url.startsWith('data:'));
    open.href = url;
    box.classList.add('on');
}

/** Bấm ảnh trong thảo luận / giải thích đã hiển thị -> phóng to; trong ô đang sửa thì bấm đúp. */
export function initMedia() {
    document.addEventListener('click', (e) => {
        const img = e.target.closest?.('#chat-messages img, .rm-mimg img, #quiz-live .rm-md img, #quiz-result img, [data-zoom] img');
        if (!img || img.closest('[contenteditable="true"]')) return;
        e.preventDefault();
        openLightbox(img.currentSrc || img.src, img.alt || '');
    });
    document.addEventListener('dblclick', (e) => {
        const img = e.target.closest?.('[data-live-edit] img');
        if (img) openLightbox(img.currentSrc || img.src, img.alt || '');
    });
}
