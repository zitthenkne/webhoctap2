// bien-luan-editor.js — X. BIỆN LUẬN LÂM SÀNG viết theo từng vấn đề, như mẫu bệnh án
// học thuật: mỗi vấn đề đi một mạch "lâm sàng ủng hộ → nghĩ đến → nguyên nhân cần nghĩ
// → cái gì không nghĩ và vì sao", rồi phân định các chẩn đoán, rồi biện luận biến chứng.
//
// Lưu ở record.bienLuan = { vanDe:[], phanDinh:[], bienChung:[] }
// Máy ghép thành đoạn văn ghi vào ô `diagnosis-reasoning` cũ nên phần xuất file không đổi.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LEVELS = ['Nghĩ nhiều nhất', 'Nghĩ tới', 'Ít nghĩ', 'Loại trừ'];

/* Bốn bước của một đoạn biện luận — nhãn ngắn, gợi ý dài để vừa điền vừa học */
const STEPS = [
    ['lamSang', 'Lâm sàng ủng hộ', 'Liệt kê triệu chứng cơ năng + thực thể + tiền căn tạo nên hội chứng này'],
    ['nghiDen', '→ Nghĩ đến', 'Cơ chế / hội chứng mà các dấu chứng trên chỉ điểm'],
    ['nguyenNhan', '→ Nguyên nhân cần nghĩ', 'Các nhóm nguyên nhân có thể gây ra hội chứng này'],
    ['loaiTru', '→ Không nghĩ / loại trừ vì', 'Nguyên nhân nào ít nghĩ và dấu chứng nào giúp loại bớt']
];

let data = { vanDe: [], phanDinh: [], bienChung: [] };
let host, onChangeCb = () => { };

const newId = () => 'b' + Math.random().toString(36).slice(2, 8);
const trim = (x) => String(x ?? '').trim();

export function getBienLuan() {
    return {
        vanDe: data.vanDe.filter(v => trim(v.ten) || STEPS.some(([k]) => trim(v[k]))),
        phanDinh: data.phanDinh.filter(p => trim(p.ten) || trim(p.lyDo)),
        bienChung: data.bienChung.filter(b => trim(b.ten) || trim(b.lapLuan))
    };
}

export function setBienLuan(obj) {
    data = {
        vanDe: [], phanDinh: [], bienChung: [],
        ...JSON.parse(JSON.stringify(obj || {}))
    };
    ['vanDe', 'phanDinh', 'bienChung'].forEach(k => {
        if (!Array.isArray(data[k])) data[k] = [];
        data[k].forEach(x => { x.id ||= newId(); });
    });
    render();
}

/** Đồng bộ danh sách vấn đề từ mục VIII. Đặt vấn đề (mỗi dòng một vấn đề) */
export function syncFromProblems() {
    const lines = (($('problem-list')?.value || '').split('\n')
        .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean));
    if (!lines.length) return;
    let added = 0;
    lines.forEach(ten => {
        if (!data.vanDe.some(v => trim(v.ten).toLowerCase() === ten.toLowerCase())) {
            data.vanDe.push({ id: newId(), ten, lamSang: '', nghiDen: '', nguyenNhan: '', loaiTru: '' });
            added++;
        }
    });
    if (added) { render(); onChangeCb(); }
    return added;
}

/* =====================================================================
   Vẽ
   ===================================================================== */
function vanDeHtml(v, i) {
    return `<div class="bl-card" data-kind="vanDe" data-i="${i}">
        <div class="bl-head">
            <span class="bl-no">Vấn đề ${i + 1}</span>
            <input class="bl-title" data-k="ten" value="${esc(v.ten)}" placeholder="Tên hội chứng / vấn đề" aria-label="Tên vấn đề">
            <button type="button" class="bl-x" data-act="del" title="Xóa vấn đề"><i class="fas fa-trash"></i></button>
        </div>
        ${STEPS.map(([k, label, hint]) => `<label class="bl-field">
            <span class="bl-label">${label}</span>
            <textarea class="bl-in" data-k="${k}" rows="2" placeholder="${esc(hint)}">${esc(v[k] || '')}</textarea>
        </label>`).join('')}
    </div>`;
}

function phanDinhHtml(p, i) {
    const lv = p.muc || LEVELS[1];
    return `<div class="bl-row" data-kind="phanDinh" data-i="${i}">
        <input class="bl-in-s" data-k="ten" value="${esc(p.ten)}" placeholder="Chẩn đoán" aria-label="Chẩn đoán">
        <select class="bl-lv is-${LEVELS.indexOf(lv)}" data-k="muc" aria-label="Mức độ nghĩ tới">
            ${LEVELS.map(l => `<option ${lv === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <input class="bl-in-s" data-k="lyDo" value="${esc(p.lyDo)}" placeholder="Vì sao (bệnh cảnh, dấu chứng ủng hộ / thiếu)" aria-label="Lý do">
        <button type="button" class="bl-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;
}

function bienChungHtml(b, i) {
    return `<div class="bl-row bl-row-2" data-kind="bienChung" data-i="${i}">
        <input class="bl-in-s" data-k="ten" value="${esc(b.ten)}" placeholder="Biến chứng nghi ngờ" aria-label="Biến chứng">
        <input class="bl-in-s" data-k="lapLuan" value="${esc(b.lapLuan)}" placeholder="Dấu chứng nào gợi ý, cần làm gì để xác định" aria-label="Lập luận">
        <button type="button" class="bl-x" data-act="del" title="Xóa dòng"><i class="fas fa-xmark"></i></button>
    </div>`;
}

function render() {
    if (!host) return;
    const empty = (t) => `<p class="bl-empty">${t}</p>`;
    host.innerHTML = `
        <div class="bl-block">
            <div class="bl-block-head">
                <span><i class="fas fa-diagram-project"></i> Biện luận từng vấn đề</span>
                <span class="bl-tools">
                    <button type="button" class="bl-mini" data-add="sync"><i class="fas fa-wand-magic-sparkles"></i> Lấy từ mục Đặt vấn đề</button>
                    <button type="button" class="bl-mini" data-add="vanDe"><i class="fas fa-plus"></i> Thêm vấn đề</button>
                </span>
            </div>
            ${data.vanDe.length ? data.vanDe.map(vanDeHtml).join('')
            : empty('Chưa có vấn đề nào — điền mục VIII rồi bấm “Lấy từ mục Đặt vấn đề”.')}
        </div>

        <div class="bl-block">
            <div class="bl-block-head">
                <span><i class="fas fa-scale-balanced"></i> Phân định các chẩn đoán</span>
                <span class="bl-tools">
                    <button type="button" class="bl-mini" data-add="phanDinh"><i class="fas fa-plus"></i> Thêm chẩn đoán</button>
                </span>
            </div>
            <p class="bl-note">Chẩn đoán “Nghĩ nhiều nhất” sẽ thành <b>chẩn đoán sơ bộ</b>, các dòng “Nghĩ tới / Ít nghĩ” thành <b>chẩn đoán phân biệt</b>.</p>
            ${data.phanDinh.length ? data.phanDinh.map(phanDinhHtml).join('') : empty('Chưa có chẩn đoán nào để phân định.')}
        </div>

        <div class="bl-block">
            <div class="bl-block-head">
                <span><i class="fas fa-triangle-exclamation"></i> Biện luận biến chứng</span>
                <span class="bl-tools">
                    <button type="button" class="bl-mini" data-add="bienChung"><i class="fas fa-plus"></i> Thêm biến chứng</button>
                </span>
            </div>
            ${data.bienChung.length ? data.bienChung.map(bienChungHtml).join('') : empty('Chưa ghi biến chứng nào.')}
        </div>`;
    host.querySelectorAll('textarea').forEach(autoGrow);
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 44) + 'px';
}

/* =====================================================================
   Ghép thành đoạn biện luận + suy ra chẩn đoán
   ===================================================================== */
export function buildProse() {
    const out = [];
    getBienLuan().vanDe.forEach((v, i) => {
        out.push(`${i + 1}. Vấn đề ${i + 1}: ${trim(v.ten) || '(chưa đặt tên)'}`);
        if (trim(v.lamSang)) out.push(`Lâm sàng: ${trim(v.lamSang)}`);
        if (trim(v.nghiDen)) out.push(`→ Nghĩ đến: ${trim(v.nghiDen)}`);
        if (trim(v.nguyenNhan)) out.push(`→ Các nguyên nhân cần nghĩ: ${trim(v.nguyenNhan)}`);
        if (trim(v.loaiTru)) out.push(`→ Không nghĩ / loại trừ: ${trim(v.loaiTru)}`);
        out.push('');
    });

    const pd = getBienLuan().phanDinh;
    if (pd.length) {
        out.push('Phân định lâm sàng các chẩn đoán:');
        pd.forEach(p => out.push(`* ${trim(p.ten)}: ${trim(p.lyDo)}${trim(p.lyDo) ? '. ' : ''}→ ${p.muc || LEVELS[1]}.`));
        out.push('');
    }

    const bc = getBienLuan().bienChung;
    if (bc.length) {
        out.push('Biện luận biến chứng:');
        bc.forEach(b => out.push(`* ${trim(b.ten)}: ${trim(b.lapLuan)}`));
    }
    return out.join('\n').trim();
}

/** { soBo, phanBiet } suy ra từ bảng phân định — để tự điền mục IX */
export function derivedDiagnosis() {
    const pd = getBienLuan().phanDinh;
    const soBo = pd.filter(p => p.muc === LEVELS[0]).map(p => trim(p.ten)).filter(Boolean);
    const phanBiet = pd.filter(p => p.muc === LEVELS[1] || p.muc === LEVELS[2])
        .map(p => trim(p.ten) + (trim(p.lyDo) ? ` — ${trim(p.lyDo)}` : '')).filter(Boolean);
    return { soBo: soBo.join('; '), phanBiet: phanBiet.join('\n') };
}

/* =====================================================================
   Khởi động
   ===================================================================== */
export function initBienLuan(options) {
    onChangeCb = options.onChange || (() => { });
    host = $('bl-host');
    if (!host) return;
    render();

    const onEdit = (e) => {
        const el = e.target;
        const box = el.closest('[data-kind]');
        if (!box || !el.dataset.k) return;
        const item = data[box.dataset.kind][+box.dataset.i];
        if (!item) return;
        item[el.dataset.k] = el.value;
        if (el.tagName === 'TEXTAREA') autoGrow(el);
        if (el.dataset.k === 'muc') render();
        onChangeCb();
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);

    host.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]');
        if (add) {
            const kind = add.dataset.add;
            if (kind === 'sync') {
                const n = syncFromProblems();
                if (!n) options.onNoProblems?.();
                return;
            }
            if (kind === 'vanDe') data.vanDe.push({ id: newId(), ten: '', lamSang: '', nghiDen: '', nguyenNhan: '', loaiTru: '' });
            if (kind === 'phanDinh') data.phanDinh.push({ id: newId(), ten: '', muc: LEVELS[1], lyDo: '' });
            if (kind === 'bienChung') data.bienChung.push({ id: newId(), ten: '', lapLuan: '' });
            render();
            onChangeCb();
            host.querySelector(`[data-kind="${kind}"]:last-of-type input`)?.focus();
            return;
        }
        const del = e.target.closest('[data-act="del"]');
        if (!del) return;
        const box = del.closest('[data-kind]');
        data[box.dataset.kind].splice(+box.dataset.i, 1);
        render();
        onChangeCb();
    });
}
