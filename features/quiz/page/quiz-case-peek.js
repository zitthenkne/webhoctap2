// File: features/quiz/page/quiz-case-peek.js
// "Xem lại ca": khi khung ca lâm sàng đã trôi lên khỏi màn hình (đang làm đáp án / đọc giải thích),
// hiện một nút nổi nhỏ; bấm (hoặc phím V) mở bảng xem nhanh nội dung ca — bottom-sheet trên điện thoại,
// hộp giữa màn trên máy tính — khỏi phải cuộn ngược lên rồi cuộn xuống lại.
// Nút + bảng gắn thẳng vào <body> (không nằm trong #quizSection bị vẽ lại mỗi câu).

let pill = null;
let sheet = null;
let io = null;

function ensureEls() {
    if (pill) return;
    pill = document.createElement('button');
    pill.type = 'button';
    pill.id = 'case-peek-pill';
    pill.className = 'hidden';
    pill.title = 'Xem lại nội dung ca (phím V)';
    pill.innerHTML = '<i class="fas fa-notes-medical" aria-hidden="true"></i><span>Xem lại ca</span>';

    sheet = document.createElement('div');
    sheet.id = 'case-peek-sheet';
    sheet.className = 'hidden';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Nội dung ca lâm sàng');
    sheet.innerHTML = `
        <div class="cps-backdrop"></div>
        <div class="cps-panel">
            <div class="cps-head">
                <span class="cps-title"><i class="fas fa-notes-medical" aria-hidden="true"></i><span class="cps-title-text"></span></span>
                <span class="cps-seq"></span>
                <button type="button" class="cps-close" aria-label="Đóng"><i class="fas fa-times"></i></button>
            </div>
            <div class="cps-body"></div>
        </div>`;
    document.body.append(pill, sheet);

    pill.addEventListener('click', openPeek);
    sheet.querySelector('.cps-backdrop').addEventListener('click', closePeek);
    sheet.querySelector('.cps-close').addEventListener('click', closePeek);
    document.addEventListener('keydown', onKey);
}

function isOpen() {
    return !!sheet && !sheet.classList.contains('hidden');
}

function onKey(e) {
    if (e.key === 'Escape' && isOpen()) { closePeek(); return; }
    if ((e.key !== 'v' && e.key !== 'V') || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = document.activeElement;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
    if (!document.getElementById('case-body')) return;   // câu đang xem không thuộc ca nào
    e.preventDefault();
    isOpen() ? closePeek() : openPeek();
}

function openPeek() {
    const panel = document.getElementById('clinical-case-panel');
    const body = document.getElementById('case-body');
    if (!panel || !body || !sheet) return;
    // Chép bản ĐÃ vẽ (giữ bảng, công thức, chỗ tô/gạch của người dùng); chỉ để đọc
    sheet.querySelector('.cps-body').innerHTML = body.innerHTML;
    const title = panel.querySelector('.font-bold');
    sheet.querySelector('.cps-title-text').textContent = title ? title.textContent.trim() : 'Ca lâm sàng';
    const seq = panel.querySelector('.bg-cyan-100');
    sheet.querySelector('.cps-seq').textContent = seq ? seq.textContent.trim() : '';
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
    const closeBtn = sheet.querySelector('.cps-close');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
}

function closePeek() {
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => { if (!sheet.classList.contains('show')) sheet.classList.add('hidden'); }, 220);
}

// Gọi sau mỗi lần vẽ câu: theo dõi khung ca của câu mới (hoặc ẩn nút nếu câu không thuộc ca nào).
export function syncCasePeek() {
    ensureEls();
    if (io) { io.disconnect(); io = null; }
    if (isOpen()) closePeek();
    pill.classList.add('hidden');
    const panel = document.getElementById('clinical-case-panel');
    if (!panel || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(([entry]) => {
        // Chỉ hiện khi khung ca đã trôi LÊN TRÊN màn hình (không hiện khi ca còn ở phía dưới)
        const above = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        pill.classList.toggle('hidden', !above || panel.offsetParent === null);
    }, { threshold: 0 });
    io.observe(panel);
}
