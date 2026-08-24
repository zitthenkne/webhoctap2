// findings-editor.js — chọn dấu chứng rồi máy hỏi tiếp cho đủ chi tiết.
//
// Sinh viên hay ghi "có ran phổi", "có sẹo mổ cũ" rồi bị hỏi lại: ran gì, bên nào,
// sẹo ở đâu, dài bao nhiêu. Ở đây mỗi dấu chứng là một chip; bấm vào thì mở đúng
// những câu cần khai thác, điền xong máy ghép thành câu mô tả chuẩn và chèn vào ô khám.
//
// Không lưu riêng trong bệnh án: kết quả ghép thẳng vào ô khám (khamBenh.*),
// nên phần lưu / xuất file không phải sửa gì.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SIDE = ['2 bên', 'bên phải', 'bên trái'];
const LUNG_ZONE = ['đáy phổi', '1/3 giữa phổi', 'đỉnh phổi', 'khắp phế trường'];

/* Mỗi dấu chứng: nhãn chip, các câu cần khai thác, và cách ghép thành câu mô tả.
   f là hàm đọc giá trị đã điền: f('side'), f('zone')... */
const FINDINGS = {
    'exam-general': [
        {
            k: 'pale', label: 'Da niêm nhạt',
            fields: [['muc', 'Mức độ', ['nhạt', 'rất nhạt'], 'select'],
            ['vt', 'Thấy rõ ở', ['kết mạc mắt', 'niêm mạc lưỡi', 'lòng bàn tay', 'kết mạc mắt và lòng bàn tay'], 'select']],
            tpl: f => `Da niêm ${f('muc') || 'nhạt'}, rõ ở ${f('vt') || 'kết mạc mắt'}`
        },
        {
            k: 'edema', label: 'Phù',
            fields: [['vt', 'Vị trí', ['hai chi dưới', 'mặt', 'toàn thân', 'chi dưới bên phải', 'chi dưới bên trái'], 'select'],
            ['tc', 'Tính chất', ['ấn lõm, không đau', 'ấn không lõm', 'phù trắng mềm'], 'select'],
            ['muc', 'Mức độ', ['nhẹ (mắt cá)', 'trung bình (đến cẳng chân)', 'nặng (đến đùi, bụng)'], 'select']],
            tpl: f => `Phù ${f('vt') || 'hai chi dưới'}, ${f('tc') || 'ấn lõm'}, mức độ ${f('muc') || 'nhẹ'}`
        },
        {
            k: 'bleed', label: 'Xuất huyết da niêm',
            fields: [['dang', 'Dạng', ['chấm xuất huyết', 'mảng xuất huyết', 'vết bầm máu', 'chấm và mảng xuất huyết'], 'select'],
            ['vt', 'Vị trí', '', 'text', 'vd: mặt trong đùi phải'],
            ['kt', 'Kích thước', '', 'text', 'vd: 4-5 cm'],
            ['dk', 'Kèm theo', ['ấn không mất màu', 'ấn đau', 'không đau'], 'select']],
            tpl: f => `${f('dang') || 'Chấm xuất huyết'} ở ${f('vt') || '(vị trí)'}`
                + (f('kt') ? `, kích thước ${f('kt')}` : '') + (f('dk') ? `, ${f('dk')}` : '')
        },
        {
            k: 'node', label: 'Hạch to',
            fields: [['vt', 'Vị trí', ['cổ', 'thượng đòn', 'nách', 'bẹn', 'nhiều nơi'], 'select'],
            ['ben', 'Bên', SIDE, 'select'],
            ['kt', 'Kích thước', '', 'text', 'vd: 1,5 x 2 cm'],
            ['tc', 'Tính chất', ['mềm, di động, không đau', 'cứng, ít di động', 'dính thành khối', 'đau'], 'select']],
            tpl: f => `Hạch ${f('vt') || 'cổ'} ${f('ben') || '2 bên'} sờ chạm`
                + (f('kt') ? `, kích thước ${f('kt')}` : '') + (f('tc') ? `, ${f('tc')}` : '')
        },
        {
            k: 'jaundice', label: 'Vàng da – vàng mắt',
            fields: [['muc', 'Mức độ', ['nhẹ', 'trung bình', 'đậm'], 'select'],
            ['vt', 'Thấy ở', ['kết mạc mắt', 'da và kết mạc mắt', 'toàn thân'], 'select']],
            tpl: f => `Vàng da vàng mắt mức độ ${f('muc') || 'nhẹ'}, thấy ở ${f('vt') || 'kết mạc mắt'}`
        }
    ],
    'exam-chest': [
        {
            k: 'scar', label: 'Sẹo mổ cũ',
            fields: [['vt', 'Vị trí', '', 'text', 'vd: đường ngang trên xương mu / đường trắng giữa'],
            ['dai', 'Chiều dài (cm)', '', 'text', 'vd: 12'],
            ['tc', 'Tình trạng', ['phẳng, lành tốt, không co kéo', 'lồi, co kéo', 'còn chỉ khâu', 'đang rỉ dịch'], 'select']],
            tpl: f => `Sẹo mổ cũ ${f('vt') || '(vị trí)'}${f('dai') ? ` dài khoảng ${f('dai')} cm` : ''}, ${f('tc') || 'phẳng, lành tốt'}`
        },
        {
            k: 'retract', label: 'Co kéo cơ hô hấp phụ',
            fields: [['vt', 'Vị trí', ['hõm ức', 'khoang liên sườn', 'hõm ức và khoang liên sườn'], 'select'],
            ['muc', 'Mức độ', ['nhẹ', 'rõ'], 'select']],
            tpl: f => `Co kéo cơ hô hấp phụ ở ${f('vt') || 'hõm ức'}, mức độ ${f('muc') || 'nhẹ'}`
        },
        {
            k: 'deform', label: 'Lồng ngực biến dạng',
            fields: [['dang', 'Dạng', ['hình thùng', 'gồ 1 bên', 'lép 1 bên', 'ức gà'], 'select'],
            ['ben', 'Bên', SIDE, 'select']],
            tpl: f => `Lồng ngực ${f('dang') || 'hình thùng'}${f('ben') && f('ben') !== '2 bên' ? ' ' + f('ben') : ''}`
        }
    ],
    'exam-heart': [
        {
            k: 'murmur', label: 'Âm thổi',
            fields: [['thoiKy', 'Thời kỳ', ['tâm thu', 'tâm trương', 'liên tục'], 'select'],
            ['cuongDo', 'Cường độ', ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'], 'select'],
            ['vt', 'Nghe rõ nhất ở', ['mỏm tim', 'ổ van động mạch chủ', 'ổ van động mạch phổi', 'ổ van 3 lá', 'liên sườn III cạnh ức trái'], 'select'],
            ['lan', 'Hướng lan', '', 'text', 'vd: lan ra hõm nách']],
            tpl: f => `Âm thổi ${f('thoiKy') || 'tâm thu'} ${f('cuongDo') || '2/6'} nghe rõ nhất ở ${f('vt') || 'mỏm tim'}`
                + (f('lan') ? `, ${f('lan')}` : '')
        },
        {
            k: 'rhythm', label: 'Nhịp tim bất thường',
            fields: [['dang', 'Dạng', ['nhanh đều', 'chậm đều', 'không đều', 'loạn nhịp hoàn toàn'], 'select'],
            ['tanSo', 'Tần số (l/p)', '', 'text', 'vd: 120']],
            tpl: f => `Tim ${f('dang') || 'nhanh đều'}${f('tanSo') ? `, tần số ${f('tanSo')} lần/phút` : ''}`
        },
        {
            k: 'harzer', label: 'Dấu Harzer / nảy trước ngực',
            fields: [['dau', 'Dấu chứng', ['dấu Harzer (+)', 'dấu nảy trước ngực (+)', 'cả hai'], 'select']],
            tpl: f => `${f('dau') || 'dấu Harzer (+)'}`
        }
    ],
    'exam-lung': [
        {
            k: 'rale', label: 'Ran phổi',
            fields: [['loai', 'Loại ran', ['ran nổ', 'ran ẩm', 'ran rít', 'ran ngáy', 'ran nổ và ran ẩm'], 'select'],
            ['ben', 'Bên', SIDE, 'select'],
            ['vt', 'Vị trí', LUNG_ZONE, 'select'],
            ['thoiKy', 'Nghe rõ ở', ['cuối thì hít vào', 'thì thở ra', 'cả hai thì'], 'select']],
            tpl: f => `Nghe ${f('loai') || 'ran nổ'} ${f('vt') || 'đáy phổi'} ${f('ben') || '2 bên'}`
                + (f('thoiKy') ? `, rõ ${f('thoiKy')}` : '')
        },
        {
            k: 'breath', label: 'Rì rào phế nang giảm / mất',
            fields: [['muc', 'Mức độ', ['giảm', 'mất'], 'select'],
            ['ben', 'Bên', SIDE, 'select'],
            ['vt', 'Vị trí', LUNG_ZONE, 'select']],
            tpl: f => `Rì rào phế nang ${f('muc') || 'giảm'} ${f('vt') || 'đáy phổi'} ${f('ben') || 'bên phải'}`
        },
        {
            k: 'tri', label: 'Hội chứng 3 giảm / đông đặc',
            fields: [['hc', 'Hội chứng', ['3 giảm (rung thanh giảm, gõ đục, rì rào phế nang giảm)', 'đông đặc (rung thanh tăng, gõ đục, có ran nổ)'], 'select'],
            ['ben', 'Bên', SIDE, 'select'],
            ['vt', 'Vị trí', LUNG_ZONE, 'select']],
            tpl: f => `Hội chứng ${f('hc') || '3 giảm'} ${f('vt') || 'đáy phổi'} ${f('ben') || 'bên phải'}`
        }
    ],
    'exam-abdomen': [
        {
            k: 'liver', label: 'Gan to',
            fields: [['bs', 'Dưới bờ sườn (cm)', '', 'text', 'vd: 3'],
            ['bo', 'Bờ', ['bờ tù', 'bờ sắc'], 'select'],
            ['mat', 'Mặt', ['mặt nhẵn', 'mặt gồ ghề'], 'select'],
            ['md', 'Mật độ', ['mềm', 'chắc', 'cứng'], 'select'],
            ['dau', 'Ấn đau', ['không đau', 'đau'], 'select']],
            tpl: f => `Gan to ${f('bs') ? f('bs') + ' cm ' : ''}dưới bờ sườn phải`
                + [f('bo'), f('mat'), f('md'), f('dau')].filter(Boolean).map(x => ', ' + x).join('')
        },
        {
            k: 'spleen', label: 'Lách to',
            fields: [['do', 'Phân độ (Hackett)', ['độ I', 'độ II', 'độ III', 'độ IV'], 'select'],
            ['kt', 'Kích thước siêu âm (cm)', '', 'text', 'vd: 17'],
            ['dau', 'Ấn đau', ['không đau', 'đau'], 'select']],
            tpl: f => `Lách to ${f('do') || 'độ II'}`
                + (f('kt') ? `, siêu âm ${f('kt')} cm` : '') + (f('dau') ? `, ${f('dau')}` : '')
        },
        {
            k: 'tender', label: 'Điểm đau khu trú',
            fields: [['vt', 'Vị trí', ['thượng vị', 'hạ sườn phải', 'hố chậu phải', 'hố chậu trái', 'quanh rốn', 'hạ vị', 'điểm Mac Burney'], 'select'],
            ['muc', 'Mức độ', ['ấn đau nhẹ', 'ấn đau rõ', 'đau kèm phản ứng thành bụng'], 'select']],
            tpl: f => `Ấn đau ${f('vt') || 'thượng vị'}, ${f('muc') || 'ấn đau rõ'}`
        },
        {
            k: 'ascites', label: 'Dịch ổ bụng',
            fields: [['muc', 'Mức độ', ['ít (gõ đục vùng thấp)', 'trung bình', 'nhiều (bụng căng, sóng vỗ (+))'], 'select'],
            ['dau', 'Dấu chứng', ['gõ đục vùng thấp (+)', 'vùng đục di chuyển (+)', 'dấu sóng vỗ (+)'], 'select']],
            tpl: f => `Dịch ổ bụng ${f('muc') || 'ít'}, ${f('dau') || 'gõ đục vùng thấp (+)'}`
        },
        {
            k: 'scar2', label: 'Sẹo mổ cũ',
            fields: [['vt', 'Vị trí', '', 'text', 'vd: đường ngang trên xương mu'],
            ['dai', 'Chiều dài (cm)', '', 'text', 'vd: 12'],
            ['tc', 'Tình trạng', ['phẳng, lành tốt, không co kéo', 'lồi, co kéo'], 'select']],
            tpl: f => `Sẹo mổ cũ ${f('vt') || '(vị trí)'}${f('dai') ? ` dài khoảng ${f('dai')} cm` : ''}, ${f('tc') || 'phẳng, lành tốt'}`
        }
    ],
    'exam-neuro-msk': [
        {
            k: 'weak', label: 'Yếu / liệt chi',
            fields: [['vt', 'Vị trí', ['nửa người phải', 'nửa người trái', 'hai chi dưới', 'hai chi trên', 'tứ chi'], 'select'],
            ['suc', 'Sức cơ', ['1/5', '2/5', '3/5', '4/5'], 'select']],
            tpl: f => `Yếu ${f('vt') || 'nửa người phải'}, sức cơ ${f('suc') || '3/5'}`
        },
        {
            k: 'joint', label: 'Khớp sưng đau',
            fields: [['vt', 'Khớp', '', 'text', 'vd: khớp gối phải'],
            ['dau', 'Tính chất', ['sưng nóng đỏ đau', 'sưng đau, không nóng đỏ', 'biến dạng khớp'], 'select'],
            ['van', 'Vận động', ['giới hạn tầm vận động', 'không giới hạn'], 'select']],
            tpl: f => `${f('vt') || 'Khớp gối phải'}: ${f('dau') || 'sưng nóng đỏ đau'}, ${f('van') || 'giới hạn tầm vận động'}`
        },
        {
            k: 'spine', label: 'Đau cột sống',
            fields: [['vt', 'Vị trí', ['cột sống cổ', 'cột sống ngực', 'cột sống thắt lưng'], 'select'],
            ['tc', 'Tính chất', ['đau âm ỉ', 'đau dữ dội', 'đau khi ấn'], 'select'],
            ['lan', 'Lan', '', 'text', 'vd: lan xuống chân phải']],
            tpl: f => `Đau ${f('vt') || 'cột sống thắt lưng'}, ${f('tc') || 'đau âm ỉ'}${f('lan') ? `, ${f('lan')}` : ''}`
        }
    ],
    'exam-head': [
        {
            k: 'thyroid', label: 'Tuyến giáp to',
            fields: [['do', 'Độ', ['độ Ia', 'độ Ib', 'độ II', 'độ III'], 'select'],
            ['tc', 'Tính chất', ['mềm, di động theo nhịp nuốt', 'chắc', 'có nhân'], 'select'],
            ['am', 'Âm thổi tuyến giáp', ['không có', 'có'], 'select']],
            tpl: f => `Tuyến giáp to ${f('do') || 'độ Ib'}, ${f('tc') || 'mềm, di động theo nhịp nuốt'}`
                + (f('am') === 'có' ? ', nghe có âm thổi tuyến giáp' : '')
        },
        {
            k: 'eye', label: 'Bất thường ở mắt',
            fields: [['dau', 'Dấu chứng', ['kết mạc mắt nhạt', 'kết mạc mắt vàng', 'mắt lồi', 'xuất huyết dưới kết mạc'], 'select'],
            ['ben', 'Bên', SIDE, 'select']],
            tpl: f => `${f('dau') || 'Kết mạc mắt nhạt'} ${f('ben') || '2 bên'}`
        }
    ]
};

let onChangeCb = () => { };
let openKey = null;   // 'targetId|findingKey' đang mở
const values = new Map();   // 'targetId|k|field' -> giá trị đang điền

const val = (target, k, field) => values.get(`${target}|${k}|${field}`) || '';

function fieldHtml(target, k, [name, label, opts, type, ph]) {
    const cur = val(target, k, name);
    if (type === 'select') {
        return `<label class="fd-f"><span>${esc(label)}</span>
            <select data-fd-field="${name}">
                <option value="">— chọn —</option>
                ${opts.map(o => `<option ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select></label>`;
    }
    return `<label class="fd-f"><span>${esc(label)}</span>
        <input type="text" data-fd-field="${name}" value="${esc(cur)}" placeholder="${esc(ph || '')}"></label>`;
}

function panelHtml(target, finding) {
    const f = (name) => val(target, finding.k, name);
    return `<div class="fd-panel">
        <div class="fd-grid">${finding.fields.map(fl => fieldHtml(target, finding.k, fl)).join('')}</div>
        <div class="fd-preview"><i class="fas fa-quote-left"></i> ${esc(finding.tpl(f))}</div>
        <div class="fd-actions">
            <button type="button" class="fd-ok" data-fd-act="insert"><i class="fas fa-plus"></i> Thêm câu này vào phần khám</button>
            <button type="button" class="fd-cancel" data-fd-act="close">Đóng</button>
        </div>
    </div>`;
}

function render(box) {
    const target = box.dataset.fdFor;
    const list = FINDINGS[target] || [];
    box.innerHTML = `<div class="fd-chips">
            ${list.map(f => `<button type="button" class="fd-chip${openKey === target + '|' + f.k ? ' is-open' : ''}"
                data-fd-key="${f.k}"><i class="fas fa-plus-circle"></i> ${esc(f.label)}</button>`).join('')}
        </div>`
        + (openKey && openKey.startsWith(target + '|')
            ? panelHtml(target, list.find(f => f.k === openKey.split('|')[1]))
            : '');
}

/** Thêm một câu mô tả vào ô khám, mỗi câu một dòng */
function insertLine(targetId, text) {
    const el = document.getElementById(targetId);
    if (!el || !text) return;
    const lines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.includes(text)) lines.push(text);
    el.value = lines.join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function initFindings(options) {
    onChangeCb = options?.onChange || (() => { });
    const boxes = [...document.querySelectorAll('[data-fd-for]')];
    if (!boxes.length) return;
    boxes.forEach(render);

    document.addEventListener('click', (e) => {
        const box = e.target.closest('[data-fd-for]');
        if (!box) return;
        const target = box.dataset.fdFor;

        const chip = e.target.closest('[data-fd-key]');
        if (chip) {
            const key = target + '|' + chip.dataset.fdKey;
            openKey = openKey === key ? null : key;
            boxes.forEach(render);
            return;
        }
        const act = e.target.closest('[data-fd-act]');
        if (!act) return;
        if (act.dataset.fdAct === 'close') { openKey = null; boxes.forEach(render); return; }

        const finding = (FINDINGS[target] || []).find(f => f.k === openKey?.split('|')[1]);
        if (!finding) return;
        insertLine(target, finding.tpl((name) => val(target, finding.k, name)));
        openKey = null;
        boxes.forEach(render);
        onChangeCb();
    });

    document.addEventListener('input', onEdit);
    document.addEventListener('change', onEdit);
    function onEdit(e) {
        const box = e.target.closest('[data-fd-for]');
        const field = e.target.closest('[data-fd-field]');
        if (!box || !field || !openKey) return;
        values.set(`${box.dataset.fdFor}|${openKey.split('|')[1]}|${field.dataset.fdField}`, field.value);
        const finding = (FINDINGS[box.dataset.fdFor] || []).find(f => f.k === openKey.split('|')[1]);
        const prev = box.querySelector('.fd-preview');
        if (finding && prev) {
            prev.innerHTML = '<i class="fas fa-quote-left"></i> ' +
                esc(finding.tpl((name) => val(box.dataset.fdFor, finding.k, name)));
        }
    }
}

export const FINDING_TARGETS = Object.keys(FINDINGS);
