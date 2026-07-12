// features/quiz/quiz-srs-store.js
//
// Kho lịch "ôn ngắt quãng" (spaced repetition kiểu Anki, chấm tự động theo đúng/sai)
// của một bộ đề. Thuần logic + localStorage — KHÔNG import DOM/Firebase để trang
// index (chuông thông báo) nạp được thật rẻ.
//
// - localStorage:
//     quiz_srs_<id>      = { [qText]: { n, ivl, due, lapses, last } }
//         n      : số lần trả lời đúng liên tiếp
//         ivl    : khoảng cách ôn hiện tại (ngày)
//         due    : hạn ôn kế tiếp (ms epoch, chốt về CUỐI ngày local)
//         lapses : tổng số lần trả lời sai
//         last   : lần chấm gần nhất (ms) — dùng phân xử khi merge cloud
//     quiz_srs_meta_<id> = { date:'YYYY-MM-DD', newIntroduced, newPerDay, title, total }
//         newPerDay = null/không có → KHÔNG giới hạn câu mới (mặc định): mỗi phiên
//         gồm đủ câu đến hạn + toàn bộ câu chưa học của bộ đề. Chỉ khi người dùng
//         tự nhập số mới áp quota theo ngày. Meta không đồng bộ cloud (per-device).
//         title/total lưu kèm để chuông trên index hiển thị không cần tải Firestore.
//
// - Trên cloud, map lịch được mang theo doc quiz_study/{uid}__{quizId} dưới dạng
//   mảng `srs: [{q, n, ivl, due, lapses, last}]` — xem quiz-study-store.js.
//
// Thuật toán (SM-2 rút gọn, không ease factor vì không có nút tự đánh giá):
//   đúng → n++, ivl = 1/3/7 ngày cho 3 lần đầu, sau đó ivl = round(ivl * 2.3)
//   sai  → lapses++, n = 0, ivl = 0, due = ngay bây giờ (học lại trong ngày)

const GROWTH_FACTOR = 2.3;
const FIRST_INTERVALS = [1, 3, 7]; // ngày, cho n = 1..3
const DAY_MS = 86400000;

// ----- Khóa localStorage -----
export function srsKeys(quizId) {
    const id = quizId || 'default_quiz';
    return {
        map: `quiz_srs_${id}`,
        meta: `quiz_srs_meta_${id}`,
    };
}

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch (e) { return fallback; }
}
function writeJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
}

export function readSrsMap(quizId) {
    return readJson(srsKeys(quizId).map, {});
}
export function writeSrsMap(quizId, map) {
    writeJson(srsKeys(quizId).map, map || {});
}

// ----- Ngày giờ (mọi ranh giới ngày tính theo giờ local) -----
export function localDayStr(now = Date.now()) {
    const d = new Date(now);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}
// Cuối ngày local (23:59:59.999) của thời điểm ms — để "đến hạn ngày mai" nghĩa là
// bất kỳ lúc nào trong ngày mai đều ôn được, không phụ thuộc giờ làm bài hôm nay.
export function endOfDay(ms) {
    const d = new Date(ms);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
}

// ----- Meta (quota câu mới theo ngày) -----
export function readSrsMeta(quizId) {
    return readJson(srsKeys(quizId).meta, {});
}
function readMeta(quizId) { return readSrsMeta(quizId); }
function writeMeta(quizId, meta) {
    writeJson(srsKeys(quizId).meta, meta || {});
}
// Sang ngày mới thì reset số câu mới đã phát trong ngày.
export function ensureMetaToday(quizId, now = Date.now()) {
    const meta = readMeta(quizId);
    const today = localDayStr(now);
    if (meta.date !== today) {
        meta.date = today;
        meta.newIntroduced = 0;
        writeMeta(quizId, meta);
    }
    return meta;
}

// null = KHÔNG giới hạn (mặc định). Số 0–999 = giới hạn câu mới mỗi ngày.
function clampNewPerDay(n) {
    if (n == null || n === '') return null;
    const v = parseInt(n, 10);
    if (isNaN(v)) return null;
    return Math.max(0, Math.min(999, v));
}
export function getNewPerDay(quizId) {
    return clampNewPerDay(readMeta(quizId).newPerDay);
}
export function setNewPerDay(quizId, n) {
    const meta = readMeta(quizId);
    meta.newPerDay = clampNewPerDay(n);
    writeMeta(quizId, meta);
    return meta.newPerDay;
}

// ----- Nhật ký ôn tập theo ngày (chuỗi ngày + dải hoạt động trên dashboard) -----
// Khóa toàn cục (không theo bộ đề): { 'YYYY-MM-DD': số câu đã chấm }. Chỉ đếm
// câu chấm trong phiên ôn ngắt quãng; per-device, không sync cloud.
// CHÚ Ý: tên khóa cố tình KHÔNG bắt đầu bằng 'quiz_srs_' — prefix đó được
// getAllSrsSummaries/getAllSrsDeckDetails quét như map của một bộ đề.
const LOG_KEY = 'quizSrsReviewLog';
const LOG_KEEP_DAYS = 400;

export function readSrsLog() {
    return readJson(LOG_KEY, {});
}
function bumpSrsLog(now) {
    const log = readSrsLog();
    const day = localDayStr(now);
    log[day] = (log[day] | 0) + 1;
    const keys = Object.keys(log);
    if (keys.length > LOG_KEEP_DAYS) {
        keys.sort();
        keys.slice(0, keys.length - LOG_KEEP_DAYS).forEach(k => delete log[k]);
    }
    writeJson(LOG_KEY, log);
}
// Chuỗi ngày ôn liên tiếp. Hôm nay chưa ôn thì CHƯA phá chuỗi (còn cả ngày để
// giữ) — khi đó đếm lùi từ hôm qua.
export function getSrsStreak(now = Date.now()) {
    const log = readSrsLog();
    let t = now;
    if (!(log[localDayStr(t)] > 0)) t -= DAY_MS;
    let streak = 0;
    while (log[localDayStr(t)] > 0) { streak++; t -= DAY_MS; }
    return streak;
}

// ----- Tạm dừng / tiếp tục ôn một bộ đề -----
// paused nằm trong meta; khác các field meta còn lại, nó ĐƯỢC đồng bộ cloud qua
// cặp scalar srsPaused/srsPausedAt trên doc quiz_study (last-write-wins theo
// pausedAt) — push ở quiz-study-store.js, adopt khi kéo về ở quiz-srs-bell.js.
// Tạm dừng chỉ ẩn bộ đề khỏi chuông + mục "hôm nay" của dashboard; lịch vẫn giữ
// nguyên và người dùng vẫn có thể tự mở phiên ôn từ trang bộ đề.
export function isSrsPaused(quizId) {
    return !!readMeta(quizId).paused;
}
export function setSrsPaused(quizId, paused, now = Date.now()) {
    const meta = readMeta(quizId);
    meta.paused = !!paused;
    meta.pausedAt = now;
    writeMeta(quizId, meta);
}

// Xóa lịch ôn cục bộ (map + meta). Xóa phía cloud do dashboard đảm nhiệm
// (đẩy srs rỗng lên quiz_study) — nếu chỉ xóa local, lần sync sau sẽ hồi sinh.
export function deleteSrsLocal(quizId) {
    const k = srsKeys(quizId);
    try {
        localStorage.removeItem(k.map);
        localStorage.removeItem(k.meta);
    } catch (e) {}
}

// ----- Chấm một câu trả lời trong phiên ôn -----
export function gradeSrsAnswer(quizId, qText, isCorrect, now = Date.now()) {
    if (!qText) return null;
    const map = readSrsMap(quizId);
    const prev = map[qText];
    const entry = prev ? { ...prev } : { n: 0, ivl: 0, due: 0, lapses: 0, last: 0 };

    if (isCorrect) {
        entry.n = (entry.n | 0) + 1;
        entry.ivl = entry.n <= FIRST_INTERVALS.length
            ? FIRST_INTERVALS[entry.n - 1]
            : Math.round((entry.ivl || FIRST_INTERVALS[FIRST_INTERVALS.length - 1]) * GROWTH_FACTOR);
        entry.due = endOfDay(now + entry.ivl * DAY_MS);
    } else {
        entry.lapses = (entry.lapses | 0) + 1;
        entry.n = 0;
        entry.ivl = 0;
        entry.due = now; // đến hạn lại ngay — sẽ vào phiên ôn kế tiếp trong ngày
    }
    entry.last = now;
    map[qText] = entry;
    writeSrsMap(quizId, map);
    bumpSrsLog(now);
    return { prevExisted: !!prev, isCorrect, ivl: entry.ivl };
}

// ----- Dựng hàng đợi phiên ôn -----
// questions: mảng câu hỏi runtime (dùng q.question làm định danh).
// Hàng đợi = câu đến hạn (sắp theo due tăng dần) + câu chưa từng ôn (theo thứ tự
// gốc, tối đa quota câu mới còn lại trong ngày). Cập nhật meta (trừ quota, lưu
// title/total cho chuông). Câu mới CHƯA ghi entry — entry chỉ sinh khi trả lời;
// bỏ dở phiên thì quota đã trừ nhưng câu vẫn là "mới" hôm sau (giống Anki bỏ dở).
export function buildSrsQueue(quizId, questions, { title } = {}, now = Date.now()) {
    const meta = ensureMetaToday(quizId, now);
    const map = readSrsMap(quizId);

    const qTextOf = (q) => (q && q.question ? String(q.question).trim() : '');
    const dueList = [];
    const newList = [];
    questions.forEach(q => {
        const entry = map[qTextOf(q)];
        if (entry) {
            if (entry.due <= now) dueList.push({ q, due: entry.due });
        } else {
            newList.push(q);
        }
    });
    dueList.sort((a, b) => a.due - b.due);

    const perDay = clampNewPerDay(meta.newPerDay);
    const quota = perDay == null ? Infinity : Math.max(0, perDay - (meta.newIntroduced | 0));
    const pickedNew = quota === Infinity ? newList : newList.slice(0, quota);

    meta.newIntroduced = (meta.newIntroduced | 0) + pickedNew.length;
    if (title) meta.title = title;
    meta.total = questions.length;
    writeMeta(quizId, meta);

    return {
        queue: [...dueList.map(x => x.q), ...pickedNew],
        dueCount: dueList.length,
        newCount: pickedNew.length,
    };
}

// Xem trước số câu cho card landing — KHÔNG trừ quota / không đụng meta.
export function previewSrsCounts(quizId, questions, now = Date.now()) {
    const meta = readMeta(quizId);
    const sameDay = meta.date === localDayStr(now);
    const introduced = sameDay ? (meta.newIntroduced | 0) : 0;
    const perDay = clampNewPerDay(meta.newPerDay);
    const quota = perDay == null ? Infinity : Math.max(0, perDay - introduced);

    const map = readSrsMap(quizId);
    let due = 0, neverSeen = 0;
    (questions || []).forEach(q => {
        const entry = map[(q && q.question ? String(q.question).trim() : '')];
        if (!entry) neverSeen++;
        else if (entry.due <= now) due++;
    });
    return { due, newToday: Math.min(quota, neverSeen) };
}

// Đếm số entry đến hạn (không cần danh sách câu hỏi — dùng cho chuông).
// Có thể đếm dư entry "mồ côi" nếu nội dung câu bị sửa — chấp nhận được.
export function countDueNow(quizId, now = Date.now()) {
    const map = readSrsMap(quizId);
    let due = 0;
    Object.values(map).forEach(e => { if (e && e.due <= now) due++; });
    return due;
}

// Quét toàn bộ localStorage tìm các bộ đề có câu đến hạn — nguồn dữ liệu cho
// chuông thông báo trên index. title/total lấy từ meta (fallback quizId).
// Bộ đang tạm dừng không vào chuông.
export function getAllSrsSummaries(now = Date.now()) {
    const out = [];
    const prefix = 'quiz_srs_';
    const metaPrefix = 'quiz_srs_meta_';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix) || key.startsWith(metaPrefix)) continue;
        const quizId = key.slice(prefix.length);
        if (!quizId) continue;
        const due = countDueNow(quizId, now);
        if (due <= 0) continue;
        const meta = readMeta(quizId);
        if (meta.paused) continue;
        out.push({ quizId, due, title: meta.title || quizId, total: meta.total | 0 });
    }
    out.sort((a, b) => b.due - a.due);
    return out;
}

// Chi tiết mọi bộ đề đang có lịch ôn (kể cả tạm dừng) — nguồn dữ liệu cho
// dashboard "Ôn tập ngắt quãng" trong mục Thống kê. Mỗi bộ:
//   due        : số câu đến hạn ngay bây giờ (gồm cả quá hạn)
//   byOffset   : { 1: n, 2: n, ... } câu đến hạn sau đúng k ngày (1..daysAhead)
//   later      : số câu đến hạn sau cửa sổ daysAhead ngày
//   nextDue    : ms của hạn gần nhất trong tương lai (0 nếu không còn)
//   learned    : số câu đã từng vào lịch; strong: đúng ≥ 3 lần liên tiếp; hard: sai ≥ 3 lần
//   newToday   : số câu mới còn được phát hôm nay (theo quota, cần meta.total)
export function getAllSrsDeckDetails(daysAhead = 7, now = Date.now()) {
    const out = [];
    const prefix = 'quiz_srs_';
    const metaPrefix = 'quiz_srs_meta_';
    const todayEnd = endOfDay(now);
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix) || key.startsWith(metaPrefix)) continue;
        const quizId = key.slice(prefix.length);
        if (!quizId) continue;
        const entries = Object.values(readSrsMap(quizId)).filter(Boolean);
        if (!entries.length) continue;
        const meta = readMeta(quizId);

        let due = 0, later = 0, nextDue = 0, strong = 0, hard = 0;
        const byOffset = {};
        entries.forEach(e => {
            if ((e.n | 0) >= 3) strong++;
            if ((e.lapses | 0) >= 3) hard++;
            const d = Number(e.due) || 0;
            if (d <= now) { due++; return; }
            if (!nextDue || d < nextDue) nextDue = d;
            // due tương lai luôn chốt cuối ngày → offset ngày = khoảng cách tới
            // cuối ngày hôm nay chia ngày, làm tròn (an toàn với lệch giờ nhỏ)
            const offset = Math.max(1, Math.round((d - todayEnd) / DAY_MS));
            if (offset <= daysAhead) byOffset[offset] = (byOffset[offset] || 0) + 1;
            else later++;
        });

        // Câu mới còn lại của bộ (cần biết tổng số câu) + số được phát hôm nay theo quota
        const total = meta.total | 0;
        const newRemaining = total > 0 ? Math.max(0, total - entries.length) : 0;
        const perDay = (meta.newPerDay == null || meta.newPerDay === '') ? null : Math.max(0, parseInt(meta.newPerDay, 10) || 0);
        const introduced = meta.date === localDayStr(now) ? (meta.newIntroduced | 0) : 0;
        const newToday = perDay == null ? newRemaining : Math.min(newRemaining, Math.max(0, perDay - introduced));

        out.push({
            quizId,
            title: meta.title || quizId,
            total,
            learned: entries.length,
            strong,
            hard,
            due,
            byOffset,
            later,
            nextDue,
            newToday,
            newPerDay: perDay,
            paused: !!meta.paused,
        });
    }
    // Bộ đang hoạt động trước (nhiều câu đến hạn hơn lên đầu, rồi hạn gần hơn), bộ tạm dừng xuống cuối
    out.sort((a, b) => (a.paused - b.paused) || (b.due - a.due) || ((a.nextDue || Infinity) - (b.nextDue || Infinity)));
    return out;
}

// Hợp nhất lịch local với lịch từ cloud: union theo qText, entry có `last`
// mới hơn thắng. Dùng bởi mergeStudy trong quiz-study-store.js.
export function mergeSrsMaps(localMap, cloudMap) {
    const merged = { ...(localMap || {}) };
    Object.entries(cloudMap || {}).forEach(([q, entry]) => {
        if (!entry) return;
        const cur = merged[q];
        if (!cur || (entry.last | 0) > (cur.last | 0)) merged[q] = entry;
    });
    return merged;
}
