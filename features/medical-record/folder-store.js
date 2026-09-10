// folder-store.js — thư mục đợt thực hành cho bệnh án.
//
// Mỗi thư mục = một đợt đi lâm sàng: tên, khoa, bệnh viện, thời gian thực hành.
// Bệnh án tạo trong thư mục nào thì tự điền khoa + bệnh viện của thư mục đó.
//
// Metadata thư mục nằm ở localStorage, đồng thời mỗi bệnh án mang theo một bản sao
// (record.thuMuc) — nhờ vậy mở ở máy khác, thư mục vẫn dựng lại được từ bệnh án
// đã đồng bộ đám mây, không cần thêm collection Firestore.

const KEY = 'benhAnThuMuc';

export function listFolders() {
    try {
        const arr = JSON.parse(localStorage.getItem(KEY)) || [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function writeFolders(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { }
    return arr;
}

export function getFolder(id) {
    return listFolders().find(f => String(f.id) === String(id)) || null;
}

export function saveFolder(folder) {
    const all = listFolders();
    const i = all.findIndex(f => String(f.id) === String(folder.id));
    if (i >= 0) all[i] = { ...all[i], ...folder }; else all.push(folder);
    return writeFolders(all);
}

export function deleteFolder(id) {
    return writeFolders(listFolders().filter(f => String(f.id) !== String(id)));
}

export const newFolderId = () => 'TM-' + Date.now().toString(36);

/** Gộp thư mục ở máy với thư mục đính kèm trong bệnh án (bệnh án tạo ở máy khác) */
export function mergeFolders(records) {
    const byId = new Map(listFolders().map(f => [String(f.id), f]));
    let added = false;
    (records || []).forEach(r => {
        const t = r.thuMuc;
        if (!t || !t.id || byId.has(String(t.id))) return;
        byId.set(String(t.id), { ...t });
        added = true;
    });
    const all = [...byId.values()];
    if (added) writeFolders(all);
    return all;
}

/** Dòng mô tả ngắn: "Khoa Nội · BV Chợ Rẫy · 01/08 – 30/08/2026" */
export function folderMeta(f) {
    const d = (v) => {
        const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    };
    const time = [d(f?.tuNgay), d(f?.denNgay)].filter(Boolean).join(' – ');
    return [f?.khoa, f?.benhVien, time].filter(Boolean).join(' · ');
}

/* ---------------------------------------------------------------------
   Chuyên khoa của thư mục.

   Thư mục = một đợt đi lâm sàng, mà đợt lâm sàng thì luôn thuộc một khoa
   cụ thể. Biết khoa rồi thì bệnh án tạo trong thư mục khỏi phải hỏi lại
   "bệnh án này là nội hay ngoại" — trang viết bệnh án tự chuyển sẵn.

   Hai nguồn, ưu tiên theo thứ tự:
     1. f.loai — người dùng chọn thẳng trong ô "Chuyên khoa" của thư mục.
     2. đoán từ chữ trong tên khoa / tên đợt ("Khoa Nội tiêu hóa" -> noi).
   Đoán không ra thì trả '' và trang viết bệnh án sẽ hỏi.
   --------------------------------------------------------------------- */
const bo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').toLowerCase();

/* Xếp theo thứ tự soi: cụm chữ dài / đặc trưng đứng trước để "hau phau"
   không rơi vào nhánh "phau thuat" chung chung. */
const DAU_HIEU = [
    ['cc', /cap cuu|hoi suc|icu|cvcc|chong doc/],
    ['nhi', /\bnhi\b|so sinh|tre em|pediatric/],
    ['san', /\bsan\b|phu san|san phu|phu khoa|thai san|obstetric/],
    ['ngoai', /ngoai|phau thuat|chan thuong|chinh hinh|tiet nieu|long nguc|than kinh so nao|bong\b/],
    ['noi', /\bnoi\b|tim mach|ho hap|tieu hoa|than\b|noi tiet|huyet hoc|nhiem|lao\b|da lieu|lao khoa/]
];

/** Chuyên khoa của một thư mục: 'noi' | 'ngoai' | 'san' | 'nhi' | 'cc' | '' */
export function folderSpec(f) {
    if (!f) return '';
    if (f.loai) return f.loai;
    const s = bo(f.khoa) + ' ' + bo(f.ten);
    return DAU_HIEU.find(([, re]) => re.test(s))?.[0] || '';
}
