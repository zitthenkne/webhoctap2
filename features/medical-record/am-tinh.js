// am-tinh.js — "âm tính có giá trị" theo kiểu hỏi thật, không phải gõ thật.
//
// Âm tính có giá trị là câu trả lời KHÔNG nhưng lại có sức nặng: "không ho ra máu"
// mới dám bớt nghĩ tới lao, "không đau lan sau lưng" mới bớt nghĩ bóc tách. Trước
// đây mục này là một ô chữ trống trơn, sinh viên không biết phải hỏi ngược cái gì.
//
// Nay máy lấy sẵn danh sách theo đúng bệnh cảnh đang khai thác (pertinentNegatives
// của triệu chứng chính) và hỏi từng câu:
//   · bấm vào câu            -> ghi nhận ÂM TÍNH (câu chữ rơi vào ô cũ hx-negatives)
//   · bấm dấu (!) bên phải   -> thật ra bệnh nhân CÓ triệu chứng đó: gỡ khỏi âm tính
//                               rồi mở bảng khai thác để ghi đủ tính chất
//   · "Đều không" -> hỏi một lượt, tick hết cho nhanh
// Mỗi câu nói rõ nó dùng để loại trừ bệnh gì, nên vừa nhập vừa hiểu.

import { SYMPTOMS, findSymptom } from './trieu-chung-data.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();

let host, field, ctxFn = () => [], onChangeCb = () => { }, onPositiveCb = null;

const parts = () => String(field?.value || '').split(/[,;]+/).map(trim).filter(Boolean);
/* Ô chữ ngăn bằng dấu phẩy, mà một câu âm tính có thể có hai vế ("không ho ra máu,
   không đau tăng khi hít sâu") — nên phải so theo từng vế, không so nguyên câu. */
const ve = (cau) => String(cau || '').split(',').map(trim).filter(Boolean);
const has = (cau) => {
    const co = parts().map(fold);
    const v = ve(cau);
    return v.length > 0 && v.every(x => co.includes(fold(x)));
};

function write(list) {
    field.value = list.join(', ');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    onChangeCb();
}

const them = (cau) => {
    const co = parts();
    const themVe = ve(cau).filter(x => !co.some(p => fold(p) === fold(x)));
    if (themVe.length) write([...co, ...themVe]);
};
const bo = (cau) => {
    const v = ve(cau).map(fold);
    write(parts().filter(p => !v.includes(fold(p))));
};

/** Các câu âm tính đáng hỏi của bệnh cảnh đang khai thác */
function goiY() {
    const ten = ctxFn().map(fold);
    const syms = SYMPTOMS.filter(s => s.pertinentNegatives?.length
        && ten.some(t => t.includes(fold(s.ten))));
    const map = new Map();
    syms.forEach(s => (s.pertinentNegatives || []).forEach(([cau, viCo]) => {
        if (!map.has(cau)) map.set(cau, viCo);
    }));
    return [...map.entries()];
}

/** "không ho ra máu, không đau tăng khi hít sâu" -> "ho ra máu" (để mở bảng khai thác) */
export function tenTuCauAmTinh(cau) {
    const dau = String(cau || '').split(',')[0];
    return trim(dau.replace(/^(kh[oô]ng|ch[uư]a)\s+/i, ''));
}

function render() {
    if (!host) return;
    const list = goiY();
    const daCo = parts();
    if (!list.length) {
        host.innerHTML = daCo.length
            ? `<div class="at-line"><b>Đã ghi ${daCo.length} triệu chứng âm tính.</b>
                <span>Ghi triệu chứng chính để máy gợi thêm câu cần hỏi ngược.</span></div>`
            : `<div class="at-line"><span>Ghi triệu chứng chính (hoặc lý do vào viện) — máy sẽ bày đúng những câu cần hỏi ngược cho bệnh cảnh đó.</span></div>`;
        return;
    }
    const conThieu = list.filter(([cau]) => !has(cau)).length;
    host.innerHTML = `<div class="at-head">
            <b><i class="fas fa-circle-minus"></i> Cần hỏi ngược ${list.length} ý</b>
            ${conThieu ? `<button type="button" class="at-all" data-all="1"><i class="fas fa-check-double"></i> Đều không (${conThieu})</button>` : '<span class="at-done"><i class="fas fa-circle-check"></i> đã hỏi đủ</span>'}
        </div>
        <div class="at-list">${list.map(([cau, viCo], i) => {
        const on = has(cau);
        return `<span class="at-chip${on ? ' is-on' : ''}" data-i="${i}" title="${esc(on ? 'Đã ghi âm tính — bấm để bỏ' : 'Bấm nếu bệnh nhân KHÔNG có')}">
                <button type="button" class="at-t" data-neg="${esc(cau)}">
                    <i class="fas ${on ? 'fa-square-check' : 'fa-square'}"></i> ${esc(cau)}
                    <em>loại trừ ${esc(viCo)}</em>
                </button>
                <button type="button" class="at-yes" data-yes="${esc(cau)}" title="Thật ra bệnh nhân CÓ — khai thác thêm tính chất">
                    <i class="fas fa-circle-exclamation"></i> có
                </button>
            </span>`;
    }).join('')}</div>`;
}

/**
 * @param host  hộp chứa · field ô chữ cũ (hx-negatives)
 * @param context () => [tên triệu chứng đang khai thác]
 * @param onPositive (tênTriệuChứng, câuGốc) => void — bệnh nhân CÓ triệu chứng đó
 */
export function initAmTinh(opt = {}) {
    host = $('at-box');
    field = $('hx-negatives');
    if (!host || !field) return;
    ctxFn = opt.context || ctxFn;
    onChangeCb = opt.onChange || onChangeCb;
    onPositiveCb = opt.onPositive || null;

    host.addEventListener('click', (e) => {
        if (e.target.closest('[data-all]')) {
            goiY().forEach(([cau]) => them(cau));
            render();
            return;
        }
        const neg = e.target.closest('[data-neg]');
        if (neg) {
            const cau = neg.dataset.neg;
            has(cau) ? bo(cau) : them(cau);
            render();
            return;
        }
        const yes = e.target.closest('[data-yes]');
        if (!yes) return;
        const cau = yes.dataset.yes;
        bo(cau);                                   // dương tính thì không còn là âm tính
        render();
        const ten = tenTuCauAmTinh(cau);
        onPositiveCb?.(findSymptom(ten)?.ten || ten, cau);
    });

    field.addEventListener('input', () => render());
    render();
}

export const refreshAmTinh = render;
