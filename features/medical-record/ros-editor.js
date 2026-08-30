// ros-editor.js — Mục V "Lược qua các cơ quan": máy tự soi bất thường trong lúc gõ.
//
// Mục V trước đây là sáu ô chữ trống trơn: gõ gì vào cũng được, máy không biết trong
// đó là "bình thường" hay đang có triệu chứng, nên mục V nằm chết một chỗ — không
// nối được sang biện luận, cũng không ai nhắc khi sinh viên ghi mâu thuẫn.
//
// Nay mỗi ô được đọc lại sau từng lần gõ (hay chạm chip):
//   · tách câu thành từng vế theo dấu phẩy / chấm phẩy / xuống dòng
//   · vế mở đầu bằng "không / chưa / phủ nhận" là ÂM TÍNH — bỏ qua
//   · vế còn lại mà trùng tên một triệu chứng của chính hệ đó -> BẤT THƯỜNG
//   · bất thường nằm trong nhóm phải chú ý (ho ra máu, tiêu phân đen, yếu liệt…)
//     thì gắn cờ đỏ, vì đó là thứ không được để trôi qua mục V
//
// Hai kiểu ghi sai hay gặp nhất cũng được bắt ngay tại chỗ:
//   · vừa ghi "bình thường" vừa kể một triệu chứng trong cùng một ô
//   · bệnh sử đang có triệu chứng ở hệ này (ô được tô nổi is-ctx-hot) mà mục V
//     lại ghi bình thường
//
// Đầu mục hiện luôn "n/6 cơ quan có bất thường" để nhìn một cái là biết còn hệ nào
// chưa hỏi tới.

import { SYMPTOMS, ROS_BY_NHOM } from './trieu-chung-data.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 6 ô của mục V — nơi khác (đặt vấn đề tự động) cũng phải quét đúng bộ này */
export const ROS_IDS = Object.values(ROS_BY_NHOM);

/* Triệu chứng cơ năng của từng hệ, viết đúng kiểu sinh viên gõ vào mục V.
   Dùng cho cả chip gợi ý (bên goi-y-nhap.js) lẫn bộ dò ở đây; ai gõ tay bằng chữ
   khác trong thư viện triệu chứng thì phần TU_THU_VIEN bên dưới vớt tiếp. */
const TU_KHOA = {
    'ros-cardio': ['đau ngực', 'hồi hộp', 'đánh trống ngực', 'khó thở khi gắng sức', 'khó thở phải ngồi',
        'khó thở kịch phát về đêm', 'khó thở về đêm', 'phù chân', 'phù hai chân', 'đau cách hồi',
        'ngất', 'xỉu', 'tím tái', 'mạch nhanh'],
    'ros-resp': ['ho', 'ho khan', 'ho đàm', 'khạc đàm', 'ho ra máu', 'khó thở', 'khò khè',
        'đau ngực khi hít sâu', 'đau ngực kiểu màng phổi', 'thở nhanh', 'thở mệt'],
    'ros-gi': ['đau bụng', 'buồn nôn', 'nôn', 'nôn ói', 'ói', 'chán ăn', 'đầy bụng', 'ợ hơi', 'ợ chua',
        'nuốt khó', 'nuốt nghẹn', 'tiêu chảy', 'táo bón', 'tiêu phân đen', 'tiêu máu', 'tiêu máu đỏ',
        'vàng da', 'vàng mắt', 'sụt cân', 'bụng to dần'],
    'ros-neuro': ['đau đầu', 'chóng mặt', 'yếu liệt chi', 'yếu liệt', 'liệt', 'tê bì', 'dị cảm',
        'co giật', 'rối loạn tri giác', 'lơ mơ', 'nói khó', 'nói đớ', 'nhìn đôi', 'sụp mi',
        'run tay', 'mất ngủ'],
    'ros-msk': ['đau khớp', 'sưng khớp', 'cứng khớp buổi sáng', 'cứng khớp', 'yếu mỏi cơ', 'đau mỏi cơ',
        'đau cột sống thắt lưng', 'đau lưng', 'đau vai gáy', 'chuột rút', 'giới hạn vận động',
        'biến dạng khớp'],
    'ros-uro': ['tiểu gắt buốt', 'tiểu buốt', 'tiểu gắt', 'tiểu máu', 'tiểu đêm', 'tiểu khó',
        'tia nước tiểu yếu', 'tiểu ít', 'tiểu nhiều', 'nước tiểu đục', 'đau quặn thận',
        'đau hông lưng', 'phù mặt', 'bí tiểu']
};

/* Bắt được cái nào trong đây là phải dừng lại: không thể để nằm trong một câu
   "lược qua" rồi thôi, nó đủ sức đổi cả hướng chẩn đoán. */
const CAN_CHU_Y = new Set(['ho ra máu', 'khó thở', 'khó thở phải ngồi', 'khó thở kịch phát về đêm',
    'đau ngực', 'ngất', 'xỉu', 'tím tái', 'tiêu phân đen', 'tiêu máu', 'tiêu máu đỏ', 'vàng da',
    'vàng mắt', 'sụt cân', 'nuốt nghẹn', 'yếu liệt chi', 'yếu liệt', 'liệt', 'co giật',
    'rối loạn tri giác', 'nói khó', 'tiểu máu', 'bí tiểu']);

/** Tên triệu chứng trong thư viện, tách các vế "A – B" thành hai cách gọi riêng */
const TU_THU_VIEN = (nhom) => SYMPTOMS.filter(s => s.nhom === nhom)
    .flatMap(s => s.ten.split(/\s*[–-]\s*/))
    .map(x => x.trim().toLowerCase()).filter(x => x.length > 2);

/* id ô -> [{ ten, re }] dựng một lần lúc nạp, vì danh sách này không đổi.
   Dò theo biên chữ để "ho" không khớp nhầm bên trong "khó thở". */
const BO_DO = {};
for (const [nhom, id] of Object.entries(ROS_BY_NHOM)) {
    const ten = [...new Set([...(TU_KHOA[id] || []), ...TU_THU_VIEN(nhom)])]
        .sort((a, b) => b.length - a.length);   // cụm dài khớp trước, khỏi ra "ho" thay vì "ho ra máu"
    BO_DO[id] = ten.map(t => ({
        ten: t,
        re: new RegExp(`(^|[^a-z0-9])${fold(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`)
    }));
}

/* Hai mẫu này chạy trên chuỗi ĐÃ fold (bỏ dấu, thường hóa) — viết thẳng chữ có dấu
   vào lớp ký tự là hụt: "thường" mang dấu huyền nên [ơo] không bắt được. */
const PHU_DINH = /^(khong|chua|phu nhan|khoi|het)\b/;
const NOI_BINH_THUONG = /(binh thuong|trong gioi han|khong ghi nhan bat thuong)/;

/** Tách một ô mục V thành từng vế để xét riêng */
const veCau = (v) => String(v || '').split(/[,;.\n]+/).map(x => x.trim()).filter(Boolean);

/**
 * Đọc một ô mục V.
 * @returns {{co: boolean, batThuong: string[], doTin: string[], noiBinhThuong: boolean}}
 *   co            ô đã có chữ chưa
 *   batThuong     các triệu chứng dương tính đọc ra được
 *   doTin         phần bất thường thuộc nhóm phải chú ý
 *   noiBinhThuong trong ô có câu "bình thường / trong giới hạn"
 */
export function docRos(id) {
    const raw = String($(id)?.value || '').trim();
    const found = [];
    veCau(raw).forEach(ve => {
        const f = fold(ve);
        if (PHU_DINH.test(f)) return;               // "không ho" là âm tính, không tính
        const hit = (BO_DO[id] || []).find(k => k.re.test(f));
        if (hit && !found.includes(hit.ten)) found.push(hit.ten);
    });
    return {
        co: !!raw,
        batThuong: found,
        doTin: found.filter(t => CAN_CHU_Y.has(t)),
        noiBinhThuong: NOI_BINH_THUONG.test(fold(raw))
    };
}

/** Kết quả soi cả mục V, để chỗ khác (biện luận, rà soát) hỏi lại */
export const rosBatThuong = () => ROS_IDS
    .map(id => ({ id, ...docRos(id) }))
    .filter(r => r.batThuong.length);

/* Dòng kết quả nằm ngay dưới hàng chip của từng ô; giữ nguyên vị trí kể cả khi
   applyClinicalContext dựng lại hàng chip (chip chèn vào giữa ô và dòng này). */
function hopKetQua(id) {
    const el = $(id);
    if (!el) return null;
    const moc = el.nextElementSibling?.classList.contains('chips') ? el.nextElementSibling : el;
    const ke = moc.nextElementSibling;
    if (ke?.classList.contains('ros-flag')) return ke;
    const p = document.createElement('p');
    p.className = 'ros-flag';
    moc.insertAdjacentElement('afterend', p);
    return p;
}

function veMotO(id) {
    const box = hopKetQua(id);
    if (!box) return;
    const r = docRos(id);
    const el = $(id);
    // Bệnh sử đã khai có triệu chứng ở hệ này -> goi-y-nhap tô nổi ô bằng is-ctx-hot
    const benhSuCo = !!el?.classList.contains('is-ctx-hot');
    const out = [];

    if (r.batThuong.length) {
        const ten = r.batThuong.map(t => r.doTin.includes(t)
            ? `<b class="rf-red">${esc(t)}</b>` : `<b>${esc(t)}</b>`).join(', ');
        out.push(`<span class="rf-warn"><i class="fas fa-triangle-exclamation"></i> Bất thường: ${ten}</span>`);
        if (r.doTin.length) {
            out.push(`<span class="rf-bad"><i class="fas fa-flag"></i> ${esc(r.doTin.join(', '))} — phải mô tả rõ ở bệnh sử, đừng để nằm lại mục V</span>`);
        }
        if (r.noiBinhThuong) {
            out.push('<span class="rf-bad"><i class="fas fa-circle-exclamation"></i> Ô này vừa ghi “bình thường” vừa kể triệu chứng — sửa lại cho khớp</span>');
        }
    } else if (r.co) {
        out.push('<span class="rf-ok"><i class="fas fa-check"></i> Ghi nhận bình thường / âm tính</span>');
        if (benhSuCo) {
            out.push('<span class="rf-bad"><i class="fas fa-circle-exclamation"></i> Bệnh sử đang có triệu chứng ở hệ này — không thể ghi bình thường</span>');
        }
    }

    box.innerHTML = out.join('');
    box.classList.toggle('is-empty', !out.length);
    el?.classList.toggle('ros-abn', r.batThuong.length > 0);
}

/** Đầu mục V: đếm nhanh còn hệ nào chưa hỏi, hệ nào đang có vấn đề */
function veTomTat() {
    const host = $('ros-flag');
    if (!host) return;
    const doc = ROS_IDS.map(docRos);
    const chuaHoi = doc.filter(r => !r.co).length;
    const batThuong = doc.filter(r => r.batThuong.length).length;
    const canChuY = doc.some(r => r.doTin.length);
    const phan = [];
    if (batThuong) phan.push(`<b class="${canChuY ? 'rf-red' : ''}">${batThuong}/${ROS_IDS.length} cơ quan có bất thường</b>`);
    if (chuaHoi) phan.push(`còn ${chuaHoi} cơ quan chưa hỏi`);
    if (!phan.length) phan.push('đã hỏi đủ 6 cơ quan, không ghi nhận bất thường');
    host.innerHTML = phan.join(' · ');
}

/** Soi lại một ô (hoặc cả mục V khi không truyền id) */
export function refreshRos(id) {
    if (id) veMotO(id); else ROS_IDS.forEach(veMotO);
    veTomTat();
}

export function initRos() {
    refreshRos();
}
