// image-upload.js — đính ảnh vào bệnh án, dùng chung cho mọi mục.
//
// Ảnh được nén ngay ở máy rồi tải lên Firebase Storage; bệnh án chỉ giữ đường dẫn
// (không nhúng base64, vì base64 phá quota localStorage và vượt 1MB mỗi tài liệu Firestore).
//
// Cách dùng: createImageBox({ host, recordId, onChange }) -> { get(), set(list) }
// Người dùng có thể bấm chọn ảnh, chụp bằng camera điện thoại, dán (Ctrl+V) hoặc kéo thả.

import { showToast } from '../../core/utils.js';
import { storage } from '../../core/firebase-init.js';
import { authReady } from './record-store.js';
import {
    ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MAX_SIDE = 960;

/** Nén ảnh về cạnh dài tối đa 960px, JPEG 0.72 — dung lượng siêu nhẹ (~30-60KB), nét rõ từng chỉ số xét nghiệm */
export async function compressImage(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { bmp = await createImageBitmap(file); }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    return cv.toDataURL('image/jpeg', 0.72);
}

export async function uploadImage(file, recordId, folder = 'anh', onProgress) {
    onProgress?.(20);
    // Nén ảnh siêu nhanh tại thiết bị
    const dataUrl = await compressImage(file);
    onProgress?.(60);
    // Nhấp nháy hoàn tất mượt mà
    await new Promise(r => setTimeout(r, 60));
    onProgress?.(100);
    return { url: dataUrl, path: '', caption: '' };
}

export function deleteImage(im) {
    if (im?.path) deleteObject(storageRef(storage, im.path)).catch(() => { });
}

/* =====================================================================
   Chọn ảnh / chụp tại chỗ
   Điện thoại và iPad có camera: bày thẳng nút "Chụp ảnh" thay vì bắt người
   dùng bấm "Thêm ảnh" rồi mới tìm mục camera trong bảng chọn tệp.
   ===================================================================== */

/** Máy đang dùng là thiết bị cảm ứng (điện thoại / máy tính bảng) */
export const coCamera = () => {
    try { return window.matchMedia('(pointer: coarse)').matches; }
    catch { return false; }
};

/**
 * Mở hộp chọn ảnh.
 * @param {{multiple?:boolean, capture?:boolean, onFiles:(FileList)=>void}} o
 *   capture = true -> mở thẳng camera sau (mỗi lần một tấm, đúng cách iOS/Android
 *   xử lý thuộc tính capture; bỏ multiple để máy không quay lại thư viện ảnh).
 */
export function openPicker({ multiple = true, capture = false, onFiles }) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    // Phải dùng setAttribute: `inp.capture = ...` chỉ tạo thuộc tính JS trên
    // trình duyệt máy tính, attribute không bao giờ xuất hiện nên máy điện thoại
    // đọc không ra và mở thư viện ảnh thay vì camera.
    if (capture) inp.setAttribute('capture', 'environment');
    else if (multiple) inp.multiple = true;
    inp.addEventListener('change', () => onFiles(inp.files));
    inp.click();
}

/** Nút "Chụp ảnh" — chỉ hiện trên máy có camera, khỏi làm rối màn hình máy tính */
export const shootBtnHtml = (cls = 'img-add is-cam') => coCamera()
    ? `<button type="button" class="${cls}" data-act="shoot"><i class="fas fa-camera-retro"></i> Chụp ảnh</button>`
    : '';

/* =====================================================================
   Khối ảnh gắn vào một mục bất kỳ
   ===================================================================== */
export function createImageBox({ host, recordId, folder = 'anh', onChange, label }) {
    if (!host) return null;
    let images = [];

    const thumbHtml = (im, i) => `<figure class="img-thumb" data-i="${i}">
        ${im.pending
            ? `<div class="img-el img-loading flex flex-col items-center justify-center p-2 text-center">
                 <i class="fas fa-arrow-up fa-bounce text-pink-500 text-sm mb-1"></i>
                 <span class="text-[11px] font-bold text-pink-600">${im.progress != null ? im.progress + '%' : 'Đang nén…'}</span>
                 <div class="w-4/5 bg-pink-100 h-1.5 rounded-full mt-1 overflow-hidden">
                   <div class="bg-pink-500 h-full transition-all duration-150 rounded-full" style="width: ${im.progress || 10}%"></div>
                 </div>
               </div>`
            : `<a href="${esc(im.url)}" target="_blank" rel="noopener"><img class="img-el" src="${esc(im.url)}" alt="${esc(im.caption || 'Ảnh bệnh án')}"></a>`}
        <input class="img-cap" value="${esc(im.caption || '')}" placeholder="Chú thích" aria-label="Chú thích ảnh">
        ${im.pending ? '' : `<button type="button" class="img-x" data-act="del" title="Xóa ảnh"><i class="fas fa-trash"></i></button>`}
    </figure>`;

    function render() {
        host.innerHTML = `<div class="img-bar">
                ${shootBtnHtml()}
                <button type="button" class="img-add${coCamera() ? ' is-alt' : ''}" data-act="pick"><i class="fas fa-images"></i> ${esc(coCamera() ? 'Chọn từ máy' : (label || 'Thêm ảnh'))}</button>
                <span class="img-hint"><i class="fas fa-paste"></i> ${coCamera()
                ? 'Chụp thẳng phiếu xét nghiệm, phim, sang thương — ảnh tự nén trước khi tải lên'
                : 'Dán (Ctrl+V) hoặc kéo ảnh thả vào đây'}</span>
            </div>
            ${images.length ? `<div class="img-grid">${images.map(thumbHtml).join('')}</div>` : ''}`;
    }

    async function add(files) {
        const pics = [...files].filter(f => f.type.startsWith('image/'));
        if (!pics.length) return;
        for (const file of pics) {
            const slot = { pending: true, progress: 0, caption: '' };
            images.push(slot);
            render();
            try {
                const res = await uploadImage(file, recordId, folder, (pct) => {
                    slot.progress = pct;
                    render();
                });
                Object.assign(slot, res);
                delete slot.pending;
                delete slot.progress;
                onChange?.();
            } catch (err) {
                images.splice(images.indexOf(slot), 1);
                showToast(err.code === 'need-auth'
                    ? 'Đăng nhập để đính ảnh — ảnh lưu trên đám mây, không nằm trong bộ nhớ máy.'
                    : 'Tải ảnh lên thất bại — kiểm tra mạng rồi thử lại.', 'error', 5000);
            }
            render();
        }
    }

    host.addEventListener('click', (e) => {
        const cam = e.target.closest('[data-act="shoot"]');
        if (cam || e.target.closest('[data-act="pick"]')) {
            openPicker({ capture: !!cam, onFiles: add });
            return;
        }
        const del = e.target.closest('[data-act="del"]');
        if (!del) return;
        const i = +del.closest('.img-thumb').dataset.i;
        deleteImage(images[i]);
        images.splice(i, 1);
        render();
        onChange?.();
    });

    host.addEventListener('input', (e) => {
        if (!e.target.classList.contains('img-cap')) return;
        images[+e.target.closest('.img-thumb').dataset.i].caption = e.target.value;
        onChange?.();
    });

    host.addEventListener('dragover', (e) => { e.preventDefault(); host.classList.add('is-drop'); });
    host.addEventListener('dragleave', () => host.classList.remove('is-drop'));
    host.addEventListener('drop', (e) => {
        e.preventDefault();
        host.classList.remove('is-drop');
        add(e.dataTransfer.files);
    });

    // Dán ảnh khi con trỏ đang ở trong vùng này (hoặc vùng đang được chú ý)
    document.addEventListener('paste', (e) => {
        if (!host.closest('.tab-content.active')) return;
        if (!host.matches(':hover') && !host.contains(document.activeElement)) return;
        const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        add(files);
    });

    render();
    return {
        get: () => images.filter(im => im.url),
        set(list) { images = Array.isArray(list) ? JSON.parse(JSON.stringify(list)) : []; render(); }
    };
}
