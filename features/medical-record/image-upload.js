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

const MAX_SIDE = 1200;

/** Nén ảnh về cạnh dài tối đa 1200px, JPEG 0.78 — siêu nhẹ (~80-150KB), tải lên cực nhanh mà chữ vẫn sắc nét */
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
    return (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.78))) || file;
}

/** Tải ảnh lên máy chủ lưu ảnh miễn phí (Freeimage.host / Cloud CDN) có báo % tiến độ */
function uploadToFreeHost(blob, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://freeimage.host/api/1/upload');
        xhr.timeout = 25000;

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                onProgress?.(pct);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const url = data.image?.url || data.image?.display_url || data.image?.url_viewer;
                    if (url) resolve(url);
                    else reject(new Error('Không tìm thấy link ảnh trong phản hồi'));
                } catch (err) {
                    reject(err);
                }
            } else {
                reject(new Error(`Upload HTTP ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải ảnh'));
        xhr.ontimeout = () => reject(new Error('Quá thời gian tải ảnh (timeout)'));

        const formData = new FormData();
        formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
        formData.append('action', 'upload');
        formData.append('source', blob, 'image.jpg');
        formData.append('format', 'json');
        xhr.send(formData);
    });
}

export async function uploadImage(file, recordId, folder = 'anh', onProgress) {
    onProgress?.(5); // Bắt đầu nén
    const blob = await compressImage(file);
    onProgress?.(15); // Nén xong, bắt đầu đẩy dữ liệu
    try {
        const url = await uploadToFreeHost(blob, (pct) => {
            // Ánh xạ tiến trình upload từ 15% -> 95%
            const mapped = Math.round(15 + (pct * 0.8));
            onProgress?.(mapped);
        });
        onProgress?.(100);
        return { url, path: '', caption: '' };
    } catch (err) {
        console.warn('Upload free host lỗi, thử fallback Firebase Storage:', err);
        const uid = await authReady();
        if (!uid) throw Object.assign(new Error('need-auth'), { code: 'need-auth' });
        const path = `medical_records/${uid}/${recordId}/${folder}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
        onProgress?.(100);
        return { url: await getDownloadURL(storageRef(storage, path)), path, caption: '' };
    }
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
