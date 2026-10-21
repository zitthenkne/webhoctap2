// File: features/quiz/page/quiz-dictation.js
// Nói để viết (Web Speech API, vi-VN — miễn phí, không khóa API) dùng chung: ô ghi chú cá nhân + ô bài làm tự luận (2026-10-21).
//  · Chữ chèn ĐÚNG CHỖ con trỏ của ô đang viết (nhiều ô: ô chạm gần nhất), tự cách chữ + viết hoa đầu câu / đầu dòng.
//    Ô chưa từng đặt con trỏ thì nối vào cuối (selectionStart của ô chưa chạm là 0 — chèn vào đầu là sai).
//  · Lệnh bằng lời: "xuống dòng", "gạch đầu dòng", "dấu chấm", "dấu phẩy", "dấu hai chấm", "dấu chấm phẩy",
//    "dấu chấm hỏi", "dấu chấm than", "mở ngoặc", "đóng ngoặc" (phải có chữ "dấu" -> "chấm điểm", "hai chấm xuất huyết" không bị đổi).
//  · Trình duyệt tự ngắt sau quãng lặng -> nối lại tới khi người dùng bấm dừng (Safari iOS hay ngắt sớm).
export const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const CMDS = [
    [/(^|\s)dấu chấm hỏi(?=\s|$)/giu, '?'], [/(^|\s)dấu chấm than(?=\s|$)/giu, '!'], [/(^|\s)dấu chấm phẩy(?=\s|$)/giu, ';'],
    [/(^|\s)dấu hai chấm(?=\s|$)/giu, ':'], [/(^|\s)dấu chấm(?=\s|$)/giu, '.'], [/(^|\s)dấu phẩy(?=\s|$)/giu, ','],
    [/(^|\s)mở ngoặc(?=\s|$)/giu, ' ('], [/(^|\s)đóng ngoặc(?=\s|$)/giu, ')'],
    [/(^|\s)gạch đầu dòng(?=\s|$)/giu, '\n- '], [/(^|\s)xuống dòng(?=\s|$)/giu, '\n'],
];
const capAfter = (s) => s.replace(/([.?!]\s+|\n(?:-\s+)?)(\p{Ll})/gu, (m, p, l) => p + l.toUpperCase());   // đầu đoạn do joinChunk quyết

// Một đoạn vừa nghe được -> chữ viết: đổi lệnh thành dấu, dọn khoảng trắng quanh dấu
export function spokenText(t) {
    let s = ` ${String(t || '').trim()} `;
    CMDS.forEach(([re, r]) => { s = s.replace(re, r); });
    return s
        .replace(/[ \t]+([.,:;?!)])/g, '$1')                    // không cách trước dấu
        .replace(/([.,:;?!])(?=[^\s\d.,:;?!)])/g, '$1 ')         // cách sau dấu (3.5 giữ nguyên)
        .replace(/\(\s+/g, '(')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{2,}(?=- )/g, '\n')                          // "xuống dòng, gạch đầu dòng" = một dòng mới có gạch
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/^[ \t]+|[ \t]+$/g, '');
}

// Phần chèn vào sau `before`: thêm dấu cách khi cần, viết hoa nếu đang ở đầu câu / đầu dòng / ô trống
export function joinChunk(before, chunk) {
    let c = spokenText(chunk);
    if (!c) return '';
    const head = !before.trim() || /[.?!]\s*$/.test(before) || /(?:^|\n)[ \t]*(?:[-•*][ \t]+)?$/.test(before);
    if (head) c = c.charAt(0).toLocaleUpperCase('vi') + c.slice(1);
    c = capAfter(c);
    const needSpace = before && !/[\s(]$/.test(before) && !/^[\n.,:;?!)]/.test(c);
    return (needSpace ? ' ' : '') + c;
}

// Ô nào từng có con trỏ (rời ô để bấm micro vẫn nhớ chỗ): đánh dấu lúc rời ô
if (typeof document !== 'undefined') {
    document.addEventListener('focusout', (e) => { const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) t.dataset.caret = '1'; }, true);
}
function insertAtCaret(input, chunk) {
    const known = document.activeElement === input || input.dataset.caret === '1';
    const a = known ? input.selectionStart : input.value.length, b = known ? input.selectionEnd : a;
    const add = joinChunk(input.value.slice(0, a), chunk);
    if (!add) return;
    input.setRangeText(add, a, b, 'end');
    input.dataset.caret = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

let rec = null, recOn = false;
const toast = (m) => import('../../../core/utils.js').then(u => u.showToast(m, 'error', 4200));   // nạp lười: utils đụng window lúc nạp
export function stopDictation() {
    recOn = false;
    if (rec) { try { rec.onend = null; rec.stop(); } catch (e) { } rec = null; }
}
// getTarget() -> ô đang nhận chữ (gọi mỗi lần có kết quả: đổi ô giữa chừng thì chữ sang ô mới)
// ui = { on(), off(), interim(chữ đang nghe dở) }
export function toggleDictation(getTarget, ui) {
    if (recOn) { stopDictation(); ui.off(); return; }
    if (!SR) return;
    const r = new SR();
    r.lang = 'vi-VN'; r.continuous = true; r.interimResults = true;
    r.onresult = (ev) => {
        let fin = '', interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) fin += t; else interim += t;
        }
        const input = getTarget();
        if (fin.trim() && input && input.isConnected && !input.readOnly && !input.disabled) insertAtCaret(input, fin);
        ui.interim(interim);
    };
    r.onerror = (e) => {
        if (e.error === 'not-allowed') { recOn = false; ui.off(); toast('Chưa được cấp quyền micro cho trang này — bấm biểu tượng ổ khóa cạnh địa chỉ trang để cho phép.'); }
        else if (e.error === 'service-not-allowed') { recOn = false; ui.off(); toast('Máy chưa bật nhận giọng nói. iPad / iPhone: Cài đặt → Cài đặt chung → Bàn phím → bật Đọc chính tả.'); }
        else if (e.error === 'network') { recOn = false; ui.off(); toast('Nhận giọng nói cần có mạng.'); }
        else if (e.error === 'audio-capture') { recOn = false; ui.off(); toast('Không tìm thấy micro.'); }
    };
    r.onend = () => {
        if (!recOn) { ui.off(); return; }
        try { r.start(); } catch (e) { recOn = false; ui.off(); }
    };
    try { recOn = true; rec = r; r.start(); ui.on(); } catch (e) { recOn = false; rec = null; ui.off(); }
}
