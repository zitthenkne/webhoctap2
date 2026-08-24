// chi-so-chuan.js — các bảng phân loại dùng chung, tách ra để nhiều nơi cùng đọc
// (ô sinh hiệu tự gắn nhãn, và phần tự chấm mức độ cho bệnh kèm).

/** [ngưỡng trên, nhãn, lớp màu] — BMI dưới ngưỡng nào thì lấy nhãn đó */
export const BMI_TAGS = [
    [18.5, 'Gầy', 'text-blue-500'],
    [23, 'Bình thường', 'text-green-600'],
    [25, 'Thừa cân', 'text-amber-500'],
    [Infinity, 'Béo phì', 'text-red-500']
];

/** [HA tâm thu, HA tâm trương, nhãn, lớp màu] */
export const BP_STAGES = [
    [90, 60, 'Tụt huyết áp', 'text-red-500'],
    [120, 80, 'Tối ưu', 'text-green-600'],
    [130, 85, 'Bình thường', 'text-green-600'],
    [140, 90, 'Bình thường cao', 'text-amber-500'],
    [160, 100, 'Tăng huyết áp độ 1', 'text-orange-500'],
    [180, 110, 'Tăng huyết áp độ 2', 'text-red-500'],
    [Infinity, Infinity, 'Tăng huyết áp độ 3', 'text-red-600']
];
