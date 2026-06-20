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