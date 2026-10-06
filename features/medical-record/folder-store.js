// folder-store.js — thư mục đợt thực hành cho bệnh án.
//
// Mỗi thư mục = một đợt đi lâm sàng: tên, khoa, bệnh viện, thời gian thực hành.
// Bệnh án tạo trong thư mục nào thì tự điền khoa + bệnh viện của thư mục đó.
//
// Metadata thư mục nằm ở localStorage, đồng thời mỗi bệnh án mang theo một bản sao
// (record.thuMuc) — nhờ vậy mở ở máy khác, thư mục vẫn dựng lại được từ bệnh án
// đã đồng bộ đám mây.
//
// 2026-10-06: thư mục còn được đồng bộ RIÊNG (record-store.js ghi vào doc meta của người dùng):
//  - mỗi thư mục mang `_t` (ms lần sửa cuối) để máy nào sửa sau thì thắng;
//  - xóa thư mục ghi BIA MỘ ở `benhAnThuMucDel` {id: ms} — không có thì thư mục đã xóa ở máy này sẽ
//    "sống lại" từ máy khác hoặc từ bản sao trong bệnh án (mergeFolders bỏ qua id đã có bia mộ);
//  - đợt TRỐNG (chưa có bệnh án nào) cũng đi theo, vì không còn phụ thuộc bản sao trong bệnh án.

const KEY = 'benhAnThuMuc';
const DEL = 'benhAnThuMucDel';

const readDel = () => { try { return JSON.parse(localStorage.getItem(DEL)) || {}; } catch { return {}; } };
const changed = (detail) => { try { window.dispatchEvent(new CustomEvent('benhan:folders', { detail })); } catch { } };

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
    // dấu thời gian đơn điệu: luôn lớn hơn lần sửa trước dù đồng hồ máy lệch
    const t = Math.max(Date.now(), (i >= 0 ? Number(all[i]._t) || 0 : 0) + 1);
    const next = { ...(i >= 0 ? all[i] : {}), ...folder, _t: t };
    if (i >= 0) all[i] = next; else all.push(next);
    const del = readDel();
    if (del[next.id]) { delete del[next.id]; try { localStorage.setItem(DEL, JSON.stringify(del)); } catch { } }
    const out = writeFolders(all);
    changed({ id: next.id });
    return out;
}

export function deleteFolder(id) {
    const out = writeFolders(listFolders().filter(f => String(f.id) !== String(id)));
    const del = readDel();
    del[id] = Date.now();
    try { localStorage.setItem(DEL, JSON.stringify(del)); } catch { }
    changed({ id, deleted: true });
    return out;
}

/** Trạng thái để đồng bộ: { items: {id: thư mục}, del: {id: ms} } */
export function folderSync() {
    const items = {};
    listFolders().forEach(f => { if (f && f.id) items[f.id] = f; });
    return { items, del: readDel() };
}

/** Ghi lại trạng thái đã trộn (từ record-store). Không phát sự kiện — đây là kết quả đồng bộ, không phải sửa tay. */
export function applyFolderSync(items, del) {
    writeFolders(Object.values(items || {}));
    try { localStorage.setItem(DEL, JSON.stringify(del || {})); } catch { }
}

export const newFolderId = () => 'TM-' + Date.now().toString(36);

/** Gộp thư mục ở máy với thư mục đính kèm trong bệnh án (bệnh án tạo ở máy khác) */
export function mergeFolders(records) {
    const byId = new Map(listFolders().map(f => [String(f.id), f]));
    const del = readDel();
    let added = false;
    (records || []).forEach(r => {
        const t = r.thuMuc;
        if (!t || !t.id || byId.has(String(t.id)) || del[t.id]) return;
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
