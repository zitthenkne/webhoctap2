// tuyen-truoc-list.js — "ở mốc này bệnh nhân đã đi khám / nằm viện ở đâu?"
//
// Chỗ hay bị bỏ trắng nhất trong bệnh sử: đã khám / nằm viện ở đâu, bao lâu, tuyến đó
// chẩn đoán gì, điều trị gì, đỡ hay không, và VÌ SAO rời tuyến đó để tới đây. Thiếu mấy ý
// này thì không giải thích được bệnh đã qua tay ai và tại sao lại nhập viện lúc này.
//
// Không phải danh sách riêng: mỗi lần đi khám gắn thẳng vào MỘT MỐC của phần diễn tiến
// (mốc đã có sẵn thời gian), lưu ở `moc.care`. Ở đây chỉ có phần vẽ và phần ghép câu;
// `benh-su-editor.js` lo dữ liệu và sự kiện.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();

const NOI = ['Tự điều trị tại nhà', 'Nhà thuốc', 'Thầy lang – thuốc nam', 'Trạm y tế',
    'Phòng khám tư', 'Bệnh viện huyện', 'Bệnh viện tỉnh / thành phố',
    'Bệnh viện tuyến trung ương', 'Khác'];
const HINH_THUC = ['Khám rồi về', 'Nằm điều trị nội trú', 'Cấp cứu rồi chuyển ngay'];
const DAP_UNG = ['đỡ nhiều', 'đỡ ít', 'không đỡ', 'nặng hơn'];
const LY_DO = ['vượt khả năng chuyên môn tuyến dưới', 'cần phẫu thuật',
    'cần xét nghiệm – chẩn đoán hình ảnh chuyên sâu', 'bệnh nặng lên',
    'theo nguyện vọng bệnh nhân / người nhà', 'hết đợt điều trị nhưng chưa khỏi',
    'tự ý bỏ điều trị', 'không rõ lý do'];

export const hasCare = (c) => !!c && Object.entries(c).some(([, v]) => trim(v));

/** "khám tại Phòng khám tư (PK Hòa Bình), chẩn đoán Viêm phổi, điều trị kháng sinh uống, đỡ ít, chuyển tới đây vì …" */
export function careLine(c) {
    if (!hasCare(c)) return '';
    const noi = [trim(c.noi), trim(c.ten) && `(${trim(c.ten)})`].filter(Boolean).join(' ');
    const cach = trim(c.hinhThuc) ? trim(c.hinhThuc).toLowerCase() : 'đã tới';
    return [
        noi ? `${cach} tại ${noi}` : cach,
        c.hinhThuc === 'Nằm điều trị nội trú' && trim(c.nam) && `nằm ${trim(c.nam)} ngày`,
        trim(c.chanDoan) && `chẩn đoán ${trim(c.chanDoan)}`,
        trim(c.dieuTri) && `điều trị ${trim(c.dieuTri)}`,
        trim(c.dapUng),
        trim(c.lyDo) && `chuyển tới đây vì ${trim(c.lyDo)}`
    ].filter(Boolean).join(', ');
}

const opt = (list, val) => list.map(x =>
    `<option ${val === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
const f = (lb, inner) => `<label class="tt-f"><span>${esc(lb)}</span>${inner}</label>`;

/** Khối "đi khám ở đâu" nằm trong một mốc; chưa có thì chỉ hiện một nút mời thêm */
export function careHtml(c) {
    if (!c) {
        return `<button type="button" class="hx-mini tt-open" data-act="care-add">
            <i class="fas fa-truck-medical"></i> Mốc này có đi khám / nhập viện ở đâu không?</button>`;
    }
    return `<div class="tt-card">
        <div class="tt-head">
            <span class="tt-tag"><i class="fas fa-truck-medical"></i> Đã khám / nằm viện ở mốc này</span>
            <button type="button" class="tt-x" data-act="care-del" title="Bỏ khối này"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="tt-grid">
            ${f('Khám / nằm ở đâu', `<select class="calc-in" data-c="noi">
                <option value="">— chọn nơi —</option>${opt(NOI, c.noi)}</select>`)}
            ${f('Tên cơ sở', `<input class="calc-in" data-c="ten" value="${esc(c.ten)}" placeholder="vd BV Đa khoa Long An">`)}
            ${f('Hình thức', `<select class="calc-in" data-c="hinhThuc">
                <option value="">— chọn —</option>${opt(HINH_THUC, c.hinhThuc)}</select>`)}
            ${c.hinhThuc === 'Nằm điều trị nội trú'
            ? f('Nằm bao nhiêu ngày', `<input class="calc-in" data-c="nam" type="number" min="0" value="${esc(c.nam)}" placeholder="vd 5">`)
            : ''}
            <label class="tt-f tt-dx"><span>Tuyến đó chẩn đoán gì</span>
                <span class="tt-pickwrap">
                    <input class="calc-in" data-c="chanDoan" value="${esc(c.chanDoan)}" placeholder="vd Viêm phổi cộng đồng">
                    <button type="button" class="tt-pick" data-act="care-pick" title="Chọn bệnh theo chuyên khoa"><i class="fas fa-magnifying-glass"></i></button>
                </span>
            </label>
            ${f('Điều trị gì', `<input class="calc-in" data-c="dieuTri" value="${esc(c.dieuTri)}" placeholder="vd kháng sinh tĩnh mạch, truyền dịch">`)}
            ${f('Đáp ứng ra sao', `<select class="calc-in" data-c="dapUng">
                <option value="">— chọn —</option>${opt(DAP_UNG, c.dapUng)}</select>`)}
            ${f('Vì sao tới viện này', `<select class="calc-in" data-c="lyDo">
                <option value="">— chọn —</option>${opt(LY_DO, c.lyDo)}</select>`)}
        </div>
        ${careLine(c) ? `<p class="tt-preview">${esc(careLine(c))}</p>` : ''}
    </div>`;
}

export const emptyCare = () => ({
    noi: '', ten: '', hinhThuc: '', nam: '', chanDoan: '', dieuTri: '', dapUng: '', lyDo: ''
});
