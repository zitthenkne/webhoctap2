// wb-templates.js — MẪU DỰNG SẴN cho bảng trắng (hội chẩn / lưu đồ / bàn luận).
// Mỗi mẫu trả về danh sách vật với id TẠM ('t1', 't2'…) và mũi tên trỏ tới id tạm đó;
// whiteboard.js đổi sang id thật, dời cả cụm vào giữa khung nhìn rồi ghi một lượt (1 lần hoàn tác).
// Chữ "…" là chỗ để nhóm điền — bấm đúp vào khối để sửa.

// Màu nền pastel — PHẢI trùng bảng FILLS trong whiteboard.js (để viền tự đậm theo nền)
const Y = '#FFF1B8', P = '#FFD9E6', O = '#FFE2CC', M = '#D6F5E8', B = '#D8ECFF', L = '#E9E0FF', W = '#FFFFFF';
const LINE = '#8A7A96';

export const TEMPLATES = [
    { key: 'case', name: 'Hội chẩn ca bệnh', desc: 'Tóm tắt · vấn đề · chẩn đoán phân biệt · xử trí', icon: 'fa-stethoscope', tint: P },
    { key: 'algo', name: 'Lưu đồ chẩn đoán', desc: 'Khối quyết định Có / Không, rẽ nhánh', icon: 'fa-diagram-project', tint: M },
    { key: 'ddx', name: 'Chẩn đoán phân biệt', desc: 'Bảng ủng hộ / chống lại / cần làm thêm', icon: 'fa-scale-balanced', tint: B },
    { key: 'patho', name: 'Cơ chế bệnh sinh', desc: 'Nguyên nhân → cơ chế → biểu hiện', icon: 'fa-dna', tint: L },
    { key: 'time', name: 'Dòng thời gian bệnh sử', desc: 'Các mốc từ khởi phát tới hiện tại', icon: 'fa-clock-rotate-left', tint: O },
    { key: 'mind', name: 'Sơ đồ tư duy một bệnh', desc: 'Định nghĩa · nguyên nhân · lâm sàng · điều trị', icon: 'fa-brain', tint: Y },
    { key: 'soap', name: 'Trình bệnh SOAP', desc: 'Chủ quan · khách quan · đánh giá · kế hoạch', icon: 'fa-notes-medical', tint: M },
    { key: 'talk', name: 'Bàn luận nhóm', desc: 'Đồng ý · còn băn khoăn · câu hỏi cần giải đáp', icon: 'fa-comments', tint: P },
];

export function buildTemplate(key) {
    let n = 0;
    const id = () => 't' + (++n);
    const S = (kind, x, y, w, h, txt, f, fs = 16) => ({ id: id(), type: 'shape', kind, x, y, w, h, txt, f, fs });
    const N = (x, y, w, h, txt, f, fs = 15) => ({ id: id(), type: 'note', x, y, w, h, txt, f, fs });
    const T = (x, y, w, txt, fs = 18, c = '#4A3B52') => ({ id: id(), type: 'text', x, y, w, txt, fs, c });
    const A = (a, b, txt = '', rt = 'elbow', more = {}) => ({ id: id(), type: 'arrow', a: { id: a.id }, b: { id: b.id }, txt, rt, hd: 'end', c: LINE, lw: 2, ...more });
    const out = [];
    const add = (...xs) => { out.push(...xs); return xs.length === 1 ? xs[0] : xs; };

    if (key === 'case') {
        add(T(0, 0, 1140, 'HỘI CHẨN CA BỆNH — …', 30, '#E0528A'));
        add(T(0, 48, 1140, 'Người trình bày: …   ·   Khoa: …   ·   Ngày: …', 15, '#9A90A6'));
        add(N(0, 110, 360, 230, 'TÓM TẮT CA\nBN …, … tuổi, giới …\nLý do vào viện: …\nBệnh sử: …\nTiền căn: …', Y));
        add(N(390, 110, 360, 230, 'KHÁM & CẬN LÂM SÀNG\nSinh hiệu: M … · HA … · NĐ … · NT … · SpO₂ …\nKhám: …\nCLS đã có: …', M));
        const vd = add(N(780, 110, 360, 230, 'ĐẶT VẤN ĐỀ\n1. …\n2. …\n3. …', O));
        const sb = add(S('pill', 390, 400, 360, 72, 'Chẩn đoán sơ bộ: …', P, 17));
        add(A(vd, sb, '', 'curve'));
        const d = [0, 390, 780].map((x, k) => add(S('round', x, 548, 360, 124, `Chẩn đoán phân biệt ${k + 1}: …\nỦng hộ: …  ·  Chống: …`, [B, L, W][k], 15)));
        d.forEach(x => add(A(sb, x)));
        add(N(0, 740, 360, 190, 'ĐỀ NGHỊ CẬN LÂM SÀNG\n- …\n- …\n- …', B));
        add(N(390, 740, 360, 190, 'HƯỚNG XỬ TRÍ\n- …\n- …\n- …', P));
        add(N(780, 740, 360, 190, 'KẾT LUẬN HỘI CHẨN\n…', L));
    } else if (key === 'algo') {
        add(T(0, 0, 900, 'LƯU ĐỒ CHẨN ĐOÁN — …', 28, '#E0528A'));
        const p1 = add(S('pill', 290, 80, 260, 64, 'Triệu chứng / lý do đến khám', M));
        const r1 = add(S('rect', 290, 204, 260, 80, 'Đánh giá ban đầu\nABC · sinh hiệu · tri giác', Y));
        const d1 = add(S('diamond', 280, 344, 280, 160, 'Có dấu hiệu nguy hiểm?', O));
        const r2 = add(S('rect', 660, 384, 240, 80, 'Xử trí cấp cứu\nổn định bệnh nhân', P));
        const r3 = add(S('rect', 290, 566, 260, 80, 'Hỏi thêm · khám kỹ\nCLS định hướng', Y));
        const d2 = add(S('diamond', 280, 706, 280, 160, 'Kết quả gợi ý …?', O));
        const c1 = add(S('pill', 40, 930, 240, 64, 'Chẩn đoán A', B));
        const c2 = add(S('pill', 560, 930, 240, 64, 'Chẩn đoán B', L));
        add(A(p1, r1), A(r1, d1), A(d1, r2, 'Có'), A(d1, r3, 'Không'));
        add(A(r2, r3, 'sau khi ổn định', 'elbow', { dash: true }));
        add(A(r3, d2), A(d2, c1, 'Có'), A(d2, c2, 'Không'));
    } else if (key === 'ddx') {
        add(T(0, 0, 1000, 'CHẨN ĐOÁN PHÂN BIỆT — …', 28, '#E0528A'));
        const cols = [[0, 200, 'Chẩn đoán', P], [210, 260, 'Ủng hộ (+)', M], [480, 260, 'Chống lại (−)', O], [750, 260, 'Cần làm để phân định', B]];
        cols.forEach(([x, w, t, f]) => add(S('round', x, 64, w, 56, t, f, 16)));
        [0, 1, 2].forEach(r => cols.forEach(([x, w], c) => add(S('rect', x, 132 + r * 124, w, 112, c === 0 ? `${r + 1}. …` : '…', c === 0 ? L : W, 15))));
        add(N(750, 510, 260, 150, 'NGHĨ NHIỀU NHẤT\n…\nVì: …', Y));
    } else if (key === 'patho') {
        add(T(0, 0, 1180, 'CƠ CHẾ BỆNH SINH — …', 28, '#E0528A'));
        const a = add(S('round', 0, 230, 220, 96, 'Nguyên nhân /\nyếu tố nguy cơ', O));
        const b = add(S('round', 300, 230, 220, 96, 'Cơ chế khởi phát', P));
        const c1 = add(S('round', 600, 110, 230, 90, 'Rối loạn …', L));
        const c2 = add(S('round', 600, 356, 230, 90, 'Rối loạn …', L));
        const e1 = add(N(920, 70, 260, 170, 'BIỂU HIỆN LÂM SÀNG\n- …\n- …', M));
        const e2 = add(N(920, 316, 260, 170, 'CẬN LÂM SÀNG\n- …\n- …', B));
        add(A(a, b, '', 'curve'), A(b, c1, '', 'curve'), A(b, c2, '', 'curve'), A(c1, e1, '', 'curve'), A(c2, e2, '', 'curve'));
        add(A(c1, e2, '', 'curve', { dash: true }));
        add(N(300, 420, 220, 130, 'ĐIỂM ĐÁNH VÀO\nCỦA ĐIỀU TRỊ\n…', Y, 14));
    } else if (key === 'time') {
        add(T(0, 0, 1180, 'DÒNG THỜI GIAN BỆNH SỬ — …', 28, '#E0528A'));
        out.push({ id: id(), type: 'arrow', a: { x: 0, y: 300 }, b: { x: 1180, y: 300 }, txt: '', rt: 'straight', hd: 'end', c: '#9C84E6', lw: 3 });
        const marks = [['N-10', Y], ['N-5', O], ['N-2', P], ['Nhập viện', L], ['Hiện tại', M]];
        const notes = ['Khởi phát: …', 'Diễn tiến: …', 'Đã điều trị: …', 'Lúc vào viện: …', 'Hiện tại: …'];
        marks.forEach(([t, f], k) => {
            const x = 40 + k * 230;
            const pill = add(S('pill', x, 276, 160, 48, t, f, 15));
            const up = k % 2 === 0;
            const note = add(N(x - 20, up ? 80 : 372, 200, 140, notes[k], f, 14));
            add(A(pill, note, '', 'straight', { hd: 'none', dash: true }));
        });
    } else if (key === 'mind') {
        const c = add(S('ellipse', 400, 250, 260, 120, 'Tên bệnh', P, 22));
        const br = [['Định nghĩa · dịch tễ', Y], ['Nguyên nhân · YTNC', O], ['Sinh lý bệnh', L], ['Lâm sàng', M], ['Cận lâm sàng', B], ['Điều trị · tiên lượng', P]];
        br.forEach(([t, f], k) => {
            const left = k < 3;
            const b = add(S('pill', left ? 0 : 840, 40 + (k % 3) * 220, 220, 60, t, f, 16));
            add(A(c, b, '', 'curve', { hd: 'none', lw: 2.5 }));
            add(N(left ? 0 : 840, 112 + (k % 3) * 220, 220, 96, '- …\n- …', f, 13));
        });
    } else if (key === 'soap') {
        add(T(0, 0, 1000, 'TRÌNH BỆNH SOAP — Giường … · BN …', 28, '#E0528A'));
        [['S — CHỦ QUAN\nBN than: …\nDiễn tiến từ hôm qua: …', Y], ['O — KHÁCH QUAN\nSinh hiệu: …\nKhám: …\nCLS mới: …', M],
         ['A — ĐÁNH GIÁ\nVấn đề 1: … (ổn / chưa)\nVấn đề 2: …', O], ['P — KẾ HOẠCH\nThuốc: …\nCLS: …\nTheo dõi: …', B]]
            .forEach(([t, f], k) => add(N((k % 2) * 500, 70 + Math.floor(k / 2) * 290, 470, 260, t, f, 16)));
    } else if (key === 'talk') {
        add(T(0, 0, 1060, 'BÀN LUẬN — …', 28, '#E0528A'));
        [['Đồng ý', M], ['Còn băn khoăn', O], ['Câu hỏi cần giải đáp', B]].forEach(([t, f], k) => {
            const x = k * 360;
            add(S('pill', x, 64, 340, 54, t, f, 17));
            add(N(x, 140, 340, 150, '…', f), N(x, 310, 340, 150, '…', f));
        });
    }
    return out;
}
