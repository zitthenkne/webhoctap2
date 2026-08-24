// chan-thuong-data.js — bảng ước lượng máu mất theo xương gãy và các mốc phân độ sốc.
//
// Gãy mỗi xương mất một lượng máu rất khác nhau: gãy xương đùi có thể mất 1–2 lít
// trong khi gãy xương quay chỉ vài trăm ml. Sinh viên hay ghi "gãy xương" chung
// chung rồi không giải thích được vì sao bệnh nhân sốc — nên ở đây chọn đúng xương,
// máy cộng lại và đối chiếu với thể tích máu của bệnh nhân.
//
// Số liệu là khoảng ước lượng kinh điển dùng để dạy (ATLS / sách chấn thương chỉnh hình),
// dùng để biện luận, KHÔNG thay cho đánh giá lâm sàng và xét nghiệm.

/** [tên xương, máu mất tối thiểu (ml), máu mất tối đa (ml)] */
export const XUONG_GAY = [
    { ten: 'Khung chậu — gãy vững', lo: 500, hi: 1000 },
    { ten: 'Khung chậu — gãy không vững', lo: 1500, hi: 3000 },
    { ten: 'Xương đùi — thân xương', lo: 1000, hi: 2000 },
    { ten: 'Xương đùi — cổ xương đùi', lo: 500, hi: 1500 },
    { ten: 'Xương chày (cẳng chân)', lo: 500, hi: 1000 },
    { ten: 'Xương mác đơn thuần', lo: 250, hi: 500 },
    { ten: 'Xương cánh tay', lo: 500, hi: 750 },
    { ten: 'Xương quay – xương trụ (cẳng tay)', lo: 250, hi: 500 },
    { ten: 'Xương đòn', lo: 150, hi: 300 },
    { ten: 'Xương bả vai', lo: 250, hi: 500 },
    { ten: 'Một xương sườn', lo: 100, hi: 150 },
    { ten: 'Đốt sống', lo: 500, hi: 1000 },
    { ten: 'Xương gót', lo: 150, hi: 300 },
    { ten: 'Xương bàn tay / bàn chân', lo: 50, hi: 150 }
];

/** Thể tích máu ước lượng theo tuổi (ml/kg) */
export const ML_PER_KG = { nguoiLon: 70, treEm: 80, soSinh: 90 };

/**
 * Phân độ sốc mất máu theo % thể tích máu đã mất (ATLS).
 * Trả về { do, ten, mota } — dùng để biện luận mức độ nặng.
 */
export function phanDoSoc(pct) {
    if (pct < 15) return { do: 1, ten: 'Độ I', mota: 'mất < 15% thể tích máu — sinh hiệu thường còn bình thường' };
    if (pct < 30) return { do: 2, ten: 'Độ II', mota: 'mất 15–30% — mạch nhanh, hiệu áp kẹp, còn bù trừ' };
    if (pct < 40) return { do: 3, ten: 'Độ III', mota: 'mất 30–40% — tụt huyết áp, thiểu niệu, cần truyền máu' };
    return { do: 4, ten: 'Độ IV', mota: 'mất > 40% — đe dọa tính mạng, hồi sức và cầm máu khẩn' };
}

/**
 * Cộng máu mất từ danh sách xương đã chọn.
 * @param picked  [{ ten, n }] — n là số xương cùng loại (vd 3 xương sườn)
 * @param weight  cân nặng (kg); mlPerKg tùy người lớn / trẻ em
 */
export function tinhMauMat(picked, weight, mlPerKg = ML_PER_KG.nguoiLon) {
    let lo = 0, hi = 0, soXuong = 0;
    picked.forEach(({ ten, n }) => {
        const b = XUONG_GAY.find(x => x.ten === ten);
        const so = Math.max(1, parseInt(n) || 1);
        if (!b) return;
        lo += b.lo * so;
        hi += b.hi * so;
        soXuong += so;
    });
    if (!soXuong) return null;

    const tb = Math.round((lo + hi) / 2);
    const tvMau = weight > 0 ? Math.round(weight * mlPerKg) : null;
    const pct = tvMau ? (tb / tvMau) * 100 : null;
    return {
        soXuong, lo, hi, tb, tvMau,
        pct: pct == null ? null : Math.round(pct),
        soc: pct == null ? null : phanDoSoc(pct)
    };
}

/**
 * Bù dịch bỏng theo công thức Parkland: 4 ml × kg × %TBSA trong 24 giờ đầu,
 * một nửa truyền trong 8 giờ đầu tính từ lúc bị bỏng.
 */
export function parkland(pct, weight) {
    if (!(pct > 0) || !(weight > 0)) return null;
    const tong = Math.round(4 * weight * pct);
    return { tong, tam8h: Math.round(tong / 2), toc8h: Math.round(tong / 2 / 8) };
}
