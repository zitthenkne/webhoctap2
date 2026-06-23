// File: utils.js

export function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        alert(message); // Fallback to alert if container is missing
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification p-4 rounded-lg shadow-lg mb-3 flex items-center transition-all duration-300 transform translate-x-full opacity-0`;

    let bgColor = 'bg-gray-800';
    let textColor = 'text-white';
    let icon = '';

    switch (type) {
        case 'success':
            bgColor = 'bg-green-500';
            icon = '<i class="fas fa-check-circle mr-2"></i>';
            break;
        case 'error':
            bgColor = 'bg-red-500';
            icon = '<i class="fas fa-times-circle mr-2"></i>';
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            icon = '<i class="fas fa-exclamation-triangle mr-2"></i>';
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-500';
            icon = '<i class="fas fa-info-circle mr-2"></i>';
            break;
    }

    toast.classList.add(bgColor, textColor);
    toast.innerHTML = `${icon}<span>${message}</span>`;

    toastContainer.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    }, 100); // Small delay to ensure transition works

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-full', 'opacity-0');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

window.showToast = showToast;

/**
 * Hộp thoại xác nhận đẹp mắt thay cho confirm() mặc định của trình duyệt.
 * Trả về Promise<boolean>: true nếu người dùng đồng ý, false nếu hủy/đóng.
 *
 * @param {string} message Nội dung câu hỏi xác nhận
 * @param {Object} [options]
 * @param {string} [options.title='Xác nhận']        Tiêu đề
 * @param {string} [options.confirmText='Đồng ý']    Nhãn nút đồng ý
 * @param {string} [options.cancelText='Hủy']        Nhãn nút hủy
 * @param {('primary'|'danger'|'warning'|'success')} [options.tone='primary'] Tông màu/biểu tượng
 * @param {string} [options.icon]                     Class FontAwesome tùy chỉnh (ghi đè tone)
 */
export function showConfirm(message, options = {}) {
    const {
        title = 'Xác nhận',
        confirmText = 'Đồng ý',
        cancelText = 'Hủy',
        tone = 'primary',
        icon
    } = options;

    // Nạp CSS một lần duy nhất
    if (!document.getElementById('zt-confirm-style')) {
        const style = document.createElement('style');
        style.id = 'zt-confirm-style';
        style.textContent = `
        .zt-confirm-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;
            background:rgba(17,24,39,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
            opacity:0;transition:opacity .2s ease;}
        .zt-confirm-overlay.zt-show{opacity:1;}
        .zt-confirm-box{position:relative;width:100%;max-width:24rem;background:#fff;border-radius:1.25rem;
            padding:1.75rem 1.5rem 1.5rem;box-shadow:0 25px 60px rgba(0,0,0,.25);border:1px solid rgba(244,114,182,.25);
            text-align:center;transform:scale(.9) translateY(8px);opacity:0;transition:transform .22s cubic-bezier(.34,1.56,.64,1),opacity .22s ease;}
        .zt-confirm-overlay.zt-show .zt-confirm-box{transform:scale(1) translateY(0);opacity:1;}
        .zt-confirm-icon{width:3.5rem;height:3.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;
            margin:0 auto 1rem;font-size:1.4rem;}
        .zt-confirm-title{font-size:1.125rem;font-weight:800;color:#1f2937;margin:0 0 .4rem;}
        .zt-confirm-msg{font-size:.9rem;line-height:1.5;color:#6b7280;margin:0 0 1.4rem;}
        .zt-confirm-actions{display:flex;gap:.6rem;justify-content:center;}
        .zt-confirm-btn{flex:1;max-width:9rem;padding:.6rem 1rem;font-size:.9rem;font-weight:700;border:none;border-radius:.85rem;
            cursor:pointer;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease;}
        .zt-confirm-btn:active{transform:scale(.96);}
        .zt-confirm-cancel{background:#f3f4f6;color:#4b5563;}
        .zt-confirm-cancel:hover{background:#e5e7eb;}
        .zt-confirm-ok{color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.12);}
        /* Tông màu */
        .zt-tone-primary .zt-confirm-icon{background:#fce7f3;color:#ec4899;}
        .zt-tone-primary .zt-confirm-ok{background:linear-gradient(135deg,#ec4899,#f472b6);}
        .zt-tone-danger .zt-confirm-icon{background:#fee2e2;color:#ef4444;}
        .zt-tone-danger .zt-confirm-ok{background:linear-gradient(135deg,#ef4444,#f87171);}
        .zt-tone-warning .zt-confirm-icon{background:#fef3c7;color:#f59e0b;}
        .zt-tone-warning .zt-confirm-ok{background:linear-gradient(135deg,#f59e0b,#fbbf24);}
        .zt-tone-success .zt-confirm-icon{background:#dcfce7;color:#22c55e;}
        .zt-tone-success .zt-confirm-ok{background:linear-gradient(135deg,#22c55e,#4ade80);}
        /* Chế độ tối */
        .theme-dark .zt-confirm-box{background:#1f2937;border-color:rgba(255,255,255,.08);}
        .theme-dark .zt-confirm-title{color:#f9fafb;}
        .theme-dark .zt-confirm-msg{color:#9ca3af;}
        .theme-dark .zt-confirm-cancel{background:#374151;color:#d1d5db;}
        .theme-dark .zt-confirm-cancel:hover{background:#4b5563;}`;
        document.head.appendChild(style);
    }

    const icons = {
        primary: 'fa-circle-question',
        danger: 'fa-triangle-exclamation',
        warning: 'fa-triangle-exclamation',
        success: 'fa-circle-check'
    };
    const iconClass = icon || `fas ${icons[tone] || icons.primary}`;

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = `zt-confirm-overlay zt-tone-${tone}`;
        overlay.innerHTML = `
            <div class="zt-confirm-box" role="alertdialog" aria-modal="true" aria-label="${title}">
                <div class="zt-confirm-icon"><i class="${iconClass}"></i></div>
                <h3 class="zt-confirm-title"></h3>
                <p class="zt-confirm-msg"></p>
                <div class="zt-confirm-actions">
                    <button type="button" class="zt-confirm-btn zt-confirm-cancel"></button>
                    <button type="button" class="zt-confirm-btn zt-confirm-ok"></button>
                </div>
            </div>`;
        // Gán nội dung qua textContent để tránh chèn HTML ngoài ý muốn
        overlay.querySelector('.zt-confirm-title').textContent = title;
        overlay.querySelector('.zt-confirm-msg').textContent = message;
        const cancelBtn = overlay.querySelector('.zt-confirm-cancel');
        const okBtn = overlay.querySelector('.zt-confirm-ok');
        cancelBtn.textContent = cancelText;
        okBtn.textContent = confirmText;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('zt-show'));

        let done = false;
        const close = (result) => {
            if (done) return;
            done = true;
            overlay.classList.remove('zt-show');
            document.removeEventListener('keydown', onKey);
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            setTimeout(() => overlay.remove(), 300); // dự phòng nếu không có transitionend
            resolve(result);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            else if (e.key === 'Enter') close(true);
        };

        okBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', onKey);
        setTimeout(() => okBtn.focus(), 60);
    });
}

window.showConfirm = showConfirm;