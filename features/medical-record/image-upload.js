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

const MAX_SIDE = 1600;

/** Nén ảnh về cạnh dài tối đa 1600px, JPEG 0.85 — đủ đọc chữ trên phiếu xét nghiệm */
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
    return (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85))) || file;
}

export async function uploadImage(file, recordId, folder = 'anh') {
    const uid = await authReady();
    if (!uid) throw Object.assign(new Error('need-auth'), { code: 'need-auth' });
    const blob = await compressImage(file);
    const path = `medical_records/${uid}/${recordId}/${folder}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
    return { url: await getDownloadURL(storageRef(storage, path)), path, caption: '' };
}

export function deleteImage(im) {
    if (im?.path) deleteObject(storageRef(storage, im.path)).catch(() => { });
}

/* =====================================================================
   Khối ảnh gắn vào một mục bất kỳ
   ===================================================================== */
export function createImageBox({ host, recordId, folder = 'anh', onChange, label }) {
    if (!host) return null;
    let images = [];

    const thumbHtml = (im, i) => `<figure class="img-thumb" data-i="${i}">
        ${im.pending
            ? `<div class="img-el img-loading"><i class="fas fa-circle-notch fa-spin"></i></div>`
            : `<a href="${esc(im.url)}" target="_blank" rel="noopener"><img class="img-el" src="${esc(im.url)}" alt="${esc(im.caption || 'Ảnh bệnh án')}"></a>`}
        <input class="img-cap" value="${esc(im.caption || '')}" placeholder="Chú thích" aria-label="Chú thích ảnh">
        ${im.pending ? '' : `<button type="button" class="img-x" data-act="del" title="Xóa ảnh"><i class="fas fa-trash"></i></button>`}
    </figure>`;

    function render() {
        host.innerHTML = `<div class="img-bar">
                <button type="button" class="img-add" data-act="pick"><i class="fas fa-camera"></i> ${esc(label || 'Thêm ảnh')}</button>
                <span class="img-hint"><i class="fas fa-paste"></i> Dán (Ctrl+V) hoặc kéo ảnh thả vào đây</span>
            </div>
            ${images.length ? `<div class="img-grid">${images.map(thumbHtml).join('')}</div>` : ''}`;
    }

    async function add(files) {
        const pics = [...files].filter(f => f.type.startsWith('image/'));
        if (!pics.length) return;
        for (const file of pics) {
            const slot = { pending: true, caption: '' };
            images.push(slot);
            render();
            try {
                Object.assign(slot, await uploadImage(file, recordId, folder));
                delete slot.pending;
                onChange?.();
            } catch (err) {
                images.splice(images.indexOf(slot), 1);
                showToast(err.code === 'need-auth'
                    ? 'Đăng nhập để đính ảnh — ảnh lưu trên đám mây, không nằm trong bộ nhớ máy.'
                    : err?.code === 'storage/unauthorized'
                        ? 'Không có quyền tải ảnh lên (kiểm tra Storage Rules).'
                        : 'Tải ảnh lên thất bại — kiểm tra mạng rồi thử lại.', 'error', 5000);
            }
            render();
        }
    }

    host.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="pick"]')) {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
            inp.addEventListener('change', () => add(inp.files));
            inp.click();
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
