// File: features/profile/stats-service.js
// Module chịu trách nhiệm tính toán thống kê GPA, các chỉ số tổng quan & thành tựu,
// và liệt kê các bộ đề người dùng đã đánh dấu / ghi chú (tải theo yêu cầu).

import { auth, db } from '../../core/firebase-init.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast, showConfirm } from '../../core/utils.js';
import { achievements } from '../../core/achievements.js';
import { readRowsCache, syncRows, clearRowsCache, renderInsights, renderInsightsSkeleton } from './stats-insights.js';


/**
 * Tính toán GPA hệ 4 và điểm chữ từ phần trăm điểm số hệ 10
 * @param {number} percentage Phần trăm điểm số (0 - 100)
 * @returns {object} { score4, letterGrade }
 */
export function calculateGPAFromPercent(percentage) {
    const score10 = percentage / 10;
    let score4 = 0.0;
    let letterGrade = 'F';
    
    if (score10 >= 9.5) { score4 = 4.0; letterGrade = 'A+'; }
    else if (score10 >= 8.5) { score4 = 4.0; letterGrade = 'A'; }
    else if (score10 >= 8.0) { score4 = 3.5; letterGrade = 'B+'; }
    else if (score10 >= 7.0) { score4 = 3.0; letterGrade = 'B'; }
    else if (score10 >= 6.5) { score4 = 2.5; letterGrade = 'C+'; }
    else if (score10 >= 5.5) { score4 = 2.0; letterGrade = 'C'; }
    else if (score10 >= 5.0) { score4 = 1.5; letterGrade = 'D+'; }
    else if (score10 >= 4.0) { score4 = 1.0; letterGrade = 'D'; }
    else { score4 = 0.0; letterGrade = 'F'; }
    
    return { score4, letterGrade };
}

/**
 * Quy đổi số câu đúng (x) trên tổng số câu (y) ra điểm hệ 10 theo công thức UMP.
 * Tách riêng để dùng chung cho cả tính điểm lẫn gợi ý "còn mấy câu nữa".
 */
function score10FromCorrect(x, y) {
    const n = x / y;
    if (n < 0.5) return (8 * x) / y;
    if (n === 0.5) return 4.0;
    if (n < 0.6) return 4 + (10 * (x - 0.5 * y)) / y;
    if (n === 0.6) return 5.0;
    return 5 + (12.5 * (x - 0.6 * y)) / y;
}

// Bảng các mốc điểm chữ theo điểm hệ 10 (biên dưới) — dùng cho gợi ý mức tiếp theo.
const GRADE_TIERS = [
    { min10: 4.0, score4: 1.0, letter: 'D' },
    { min10: 5.0, score4: 1.5, letter: 'D+' },
    { min10: 5.5, score4: 2.0, letter: 'C' },
    { min10: 6.5, score4: 2.5, letter: 'C+' },
    { min10: 7.0, score4: 3.0, letter: 'B' },
    { min10: 8.0, score4: 3.5, letter: 'B+' },
    { min10: 8.5, score4: 4.0, letter: 'A' },
];

// ===== Thang điểm mỗi bài cho card "Tính số câu cần đạt" =====
// 'ump'    : câu đúng → hệ 10 theo công thức UMP (đồng nhất với card Quy đổi nhanh)
// 'linear' : hệ 10 = tỉ lệ đúng × 10 (thang thẳng)
// Từ nay thang này gắn theo TỪNG lần thi (row.scale); giá trị lưu trong localStorage
// chỉ còn là thang mặc định cho lần thi mới / nút "áp dụng cho tất cả".
const SCALE_MODE_KEY = 'gpaScaleMode';
const GOAL_STATE_KEY = 'gpaGoalState_v1';
const TARGET_MODE_KEY = 'gpaTargetMode'; // mục tiêu nhập theo hệ 4 ('gpa4') hay hệ 10 ('score10')

function getScaleMode() {
    try { return localStorage.getItem(SCALE_MODE_KEY) === 'linear' ? 'linear' : 'ump'; }
    catch (e) { return 'ump'; }
}

// Điểm chữ -> mốc hệ 10 thấp nhất của mức đó (dùng cho kiểu nhập "điểm chữ / hệ 4")
const LETTER_MIN10 = { 'A+': 9.5, 'A': 8.5, 'B+': 8.0, 'B': 7.0, 'C+': 6.5, 'C': 5.5, 'D+': 5.0, 'D': 4.0, 'F': 0 };

function getTargetMode() {
    try { return localStorage.getItem(TARGET_MODE_KEY) === 'score10' ? 'score10' : 'gpa4'; }
    catch (e) { return 'gpa4'; }
}

/**
 * Mục tiêu hiện tại, quy đổi qua lại giữa hệ 4 và hệ 10.
 * - mode 'gpa4'   : chọn điểm hệ 4 -> lấy mốc hệ 10 thấp nhất đạt được mức đó
 * - mode 'score10': nhập thẳng điểm hệ 10 -> suy ra hệ 4 / điểm chữ tương ứng
 * @returns {{mode:string, score10:number, gpa4:number, letter:string}}
 */
function getTarget() {
    if (getTargetMode() === 'score10') {
        const v = parseFloat(document.getElementById('desired-score-10')?.value);
        const score10 = isNaN(v) ? 8.5 : Math.max(0, Math.min(10, v));
        const { score4, letterGrade } = calculateGPAFromPercent(score10 * 10);
        return { mode: 'score10', score10, gpa4: score4, letter: letterGrade };
    }
    const g = parseFloat(document.getElementById('desired-gpa-4')?.value) || 4;
    const tier = GRADE_TIERS.find(t => Math.abs(t.score4 - g) < 1e-9);
    return { mode: 'gpa4', score10: minScore10ForGpa4(g), gpa4: g, letter: tier?.letter || 'A' };
}

/** Chuỗi mô tả mục tiêu, dùng chung cho kết quả & bảng tạm tính. */
function targetText(t) {
    return t.mode === 'score10'
        ? `<b class="text-gray-700">${t.score10.toFixed(2)}</b> điểm hệ 10 (≈ GPA ${t.gpa4.toFixed(1)} · ${t.letter})`
        : `<b class="text-gray-700">GPA ${t.gpa4.toFixed(1)}</b> (${t.letter}) · điểm tổng kết cần <b class="text-gray-700">≥ ${t.score10.toFixed(1)}</b> hệ 10`;
}

/** Điểm hệ 10 của một bài thi trắc nghiệm theo thang đang chọn. */
function rowScore10(correct, total, mode) {
    if (!total || total <= 0) return 0;
    return mode === 'linear' ? (correct / total) * 10 : score10FromCorrect(correct, total);
}

/**
 * Số câu đúng tối thiểu để bài thi đạt >= target10 (hệ 10) theo thang đang chọn.
 * Cả hai thang đều đơn điệu tăng theo số câu đúng nên quét tuyến tính là đủ.
 * @returns số câu (0..total), hoặc Infinity nếu đúng hết vẫn không chạm mốc.
 */
function minCorrectForScore10(target10, total, mode) {
    if (target10 <= 1e-9) return 0;
    for (let k = 0; k <= total; k++) {
        if (rowScore10(k, total, mode) >= target10 - 1e-9) return k;
    }
    return Infinity;
}

// ===== Cấu trúc các lần thi (mọi loại kỳ thi đều sửa được) =====
// Mỗi phần tử: { label, kind: 'ratio'|'score'|'gpa4', scale: 'ump'|'linear', weight }.
//   ratio = nhập câu đúng/tổng câu (quy đổi theo `scale`) · score = nhập thẳng điểm hệ 10
//   gpa4  = nhập điểm chữ, quy về mốc hệ 10 thấp nhất của mức đó
// Giá trị nhập vẫn nằm trong DOM, nên mọi thao tác đổi cấu trúc (thêm/xoá/đổi kiểu)
// phải capture -> render -> apply lại giá trị.
const MAX_ATTEMPTS = 12;
const DEFAULT_ROWS = {
    pretest: [
        { label: 'Pretest', kind: 'score', weight: 10 },
        { label: 'Giữa kỳ', kind: 'ratio', weight: 20 },
        { label: 'Cuối kỳ', kind: 'ratio', weight: 70 },
    ],
    nopretest: [
        { label: 'Giữa kỳ', kind: 'ratio', weight: 30 },
        { label: 'Cuối kỳ', kind: 'ratio', weight: 70 },
    ],
    custom: [
        { label: 'Giữa kỳ', kind: 'ratio', weight: 30 },
        { label: 'Cuối kỳ', kind: 'ratio', weight: 70 },
    ],
};
const defaultRowsOf = (type) => (DEFAULT_ROWS[type] || DEFAULT_ROWS.custom).map(r => ({ ...r, scale: getScaleMode() }));
let examRows = { pretest: defaultRowsOf('pretest'), nopretest: defaultRowsOf('nopretest'), custom: defaultRowsOf('custom') };
function currentExamType() {
    const v = document.getElementById('exam-type')?.value;
    return DEFAULT_ROWS[v] ? v : 'pretest';
}
/** Cấu trúc các lần thi của loại kỳ thi đang chọn (sửa trực tiếp trên mảng này). */
function currentRows() { return examRows[currentExamType()]; }

/** Escape chuỗi người dùng nhập khi nhúng vào thuộc tính/nội dung HTML. */
function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Ghi lại giá trị đang nhập của từng thẻ lần thi (theo thứ tự) trước khi vẽ lại bảng. */
function captureAttemptValues() {
    return Array.from(document.querySelectorAll('#attempts-table .attempt-row')).map(el => ({
        score: el.querySelector('.attempt-score')?.value || '',
        correct: el.querySelector('.attempt-correct')?.value || '',
        total: el.querySelector('.attempt-total')?.value || '',
        gpa4: el.querySelector('.attempt-gpa4')?.value || '',
    }));
}

/** Áp lại giá trị đã capture sau khi vẽ lại bảng (bắn 'input' để đồng bộ slider/pill). */
function applyAttemptValues(vals) {
    document.querySelectorAll('#attempts-table .attempt-row').forEach((el, i) => {
        const v = vals[i];
        if (!v) return;
        // Tổng câu phải vào trước để ô câu đúng không bị clamp sai
        const set = (sel, val) => {
            const inp = el.querySelector(sel);
            if (inp && val !== '') { inp.value = val; inp.dispatchEvent(new Event('input')); }
        };
        set('.attempt-total', v.total);
        set('.attempt-score', v.score);
        set('.attempt-correct', v.correct);
        set('.attempt-gpa4', v.gpa4);
    });
}

/**
 * Đọc số liệu một thẻ lần thi. Dùng chung cho cả phần tính toán lẫn bảng tạm tính
 * để hai nơi không bao giờ hiểu số liệu khác nhau.
 * @returns {{label,kind,scale,weight,total,correct,p,err}} p = hiệu suất 0–1, null nếu chưa nhập
 */
function readAttemptRow(el) {
    const kind = el.dataset.kind || 'ratio';
    const r = {
        label: escapeHtml(el.dataset.label || 'Lần thi'),
        kind,
        scale: el.dataset.scale === 'linear' ? 'linear' : 'ump',
        weight: parseFloat(el.querySelector('.attempt-weight')?.value),
        total: null, correct: null, p: null, err: null,
    };
    if (isNaN(r.weight) || r.weight < 0 || r.weight > 100) {
        r.err = `Trọng số của "<b>${r.label}</b>" không hợp lệ (0–100%).`;
        r.weight = 0;
        return r;
    }

    const v = (sel) => el.querySelector(sel)?.value;
    const res = rowPerf({
        kind, scale: r.scale,
        total: v('.attempt-total'), correct: v('.attempt-correct'),
        score: v('.attempt-score'), gpa4: v('.attempt-gpa4'),
    });
    r.total = res.total;
    r.correct = res.correct;
    r.p = res.p;
    if (res.err) {
        r.err = {
            'no-total': `Vui lòng nhập <b>tổng số câu</b> của "<b>${r.label}</b>".`,
            'bad-correct': `Số câu đúng của "<b>${r.label}</b>" phải trong khoảng 0–${res.total}.`,
            'bad-score': `Điểm hệ 10 của "<b>${r.label}</b>" phải trong khoảng 0–10.`,
        }[res.err];
    }
    return r;
}

/**
 * Hiệu suất 0–1 của một đợt từ số liệu THÔ — dùng chung cho ô nhập trên DOM
 * lẫn dữ liệu đã lưu của các môn khác (GPA học kỳ). Không đụng tới DOM.
 * @returns {{p:number|null, total:number|null, correct:number|null, err:string|null}}
 *          err là MÃ lỗi ('no-total' | 'bad-correct' | 'bad-score'), người gọi tự dựng câu chữ.
 */
function rowPerf({ kind = 'ratio', scale, total, correct, score, gpa4 }) {
    const out = { p: null, total: null, correct: null, err: null };

    if (kind === 'gpa4') {
        const letter = String(gpa4 ?? '').trim();
        if (letter !== '' && letter in LETTER_MIN10) out.p = LETTER_MIN10[letter] / 10;
        return out;
    }
    if (kind === 'score') {
        const raw = String(score ?? '').trim();
        if (raw === '') return out;
        const s = parseFloat(raw);
        if (isNaN(s) || s < 0 || s > 10) { out.err = 'bad-score'; return out; }
        out.p = s / 10;
        return out;
    }

    const t = parseInt(String(total ?? '').trim(), 10);
    if (isNaN(t) || t <= 0) { out.err = 'no-total'; return out; }
    out.total = t;
    const raw = String(correct ?? '').trim();
    if (raw === '') return out;
    const c = parseInt(raw, 10);
    if (isNaN(c) || c < 0 || c > t) { out.err = 'bad-correct'; return out; }
    out.correct = c;
    out.p = rowScore10(c, t, scale === 'linear' ? 'linear' : 'ump') / 10;
    return out;
}

/**
 * Điểm tổng kết của một môn từ dữ liệu ĐÃ LƯU (không cần môn đó đang mở trên màn hình).
 * Đợt chưa nhập tính 0 điểm, giống bảng tạm tính.
 * @returns {{score10, score4, letter, blanks, weightSum}|null} null nếu môn chưa nhập gì
 */
function evalSavedState(st) {
    if (!st || !Array.isArray(st.rows) || st.rows.length === 0) return null;
    let pct = 0, blanks = 0, weightSum = 0;
    for (const r of st.rows) {
        const w = parseFloat(r.weight) || 0;
        weightSum += w;
        const { p } = rowPerf({ kind: r.kind, scale: r.scale, total: r.total, correct: r.correct, score: r.score, gpa4: r.gpa4 });
        if (p === null) blanks++; else pct += p * w;
    }
    if (blanks === st.rows.length) return null; // chưa nhập đợt nào
    const { score4, letterGrade } = calculateGPAFromPercent(pct);
    return { score10: pct / 10, score4, letter: letterGrade, blanks, weightSum };
}

// Đã bấm tính ít nhất một lần -> cho phép kết quả tự cập nhật khi chỉnh số liệu
let requiredCalcDone = false;
let autoRequiredTimer = null;
function scheduleAutoRequired() {
    if (!requiredCalcDone) return;
    clearTimeout(autoRequiredTimer);
    autoRequiredTimer = setTimeout(() => calculateRequiredCorrectAnswers({ silent: true }), 350);
}

// Lưu/khôi phục dữ liệu card "số câu cần đạt" trên máy (chỉ lưu sau khi đã khôi phục xong,
// tránh việc render bảng trống lúc khởi tạo ghi đè mất dữ liệu cũ)
let goalStateRestored = false;
let saveGoalTimer = null;
function scheduleSaveGoalState() {
    if (!goalStateRestored) return;
    clearTimeout(saveGoalTimer);
    saveGoalTimer = setTimeout(saveGoalState, 400);
}
function saveGoalState() {
    if (!goalStateRestored) return;
    try {
        const state = {
            examType: currentExamType(),
            desired: document.getElementById('desired-gpa-4')?.value || '4.0',
            targetMode: getTargetMode(),
            targetScore10: document.getElementById('desired-score-10')?.value || '8.5',
            rows: Array.from(document.querySelectorAll('#attempts-table .attempt-row')).map(el => ({
                label: el.dataset.label || '',
                kind: el.dataset.kind || 'ratio',
                scale: el.dataset.scale || 'ump',
                score: el.querySelector('.attempt-score')?.value ?? '',
                correct: el.querySelector('.attempt-correct')?.value ?? '',
                total: el.querySelector('.attempt-total')?.value ?? '',
                gpa4: el.querySelector('.attempt-gpa4')?.value ?? '',
                weight: el.querySelector('.attempt-weight')?.value ?? '',
            })),
        };
        localStorage.setItem(goalKey(), JSON.stringify(state));
    } catch (e) { /* localStorage không khả dụng */ }
    renderSemesterGpa(); // môn đang mở vừa đổi điểm -> GPA học kỳ đổi theo
}
function loadGoalState() {
    try { return JSON.parse(localStorage.getItem(goalKey()) || 'null'); }
    catch (e) { return null; }
}

// ===== Nhiều môn học =====
// Mỗi môn giữ một bộ dữ liệu riêng (loại kỳ thi, cấu trúc đợt, mục tiêu, điểm đã nhập).
// Danh sách môn ở SUBJECTS_KEY; dữ liệu từng môn ở `gpaGoal::<tên môn>`.
const SUBJECTS_KEY = 'gpaSubjects_v1';
const SUBJECT_PREFIX = 'gpaGoal::';
const MAX_SUBJECTS = 20;
let subjects = null; // { active: string, names: string[] }

function loadSubjects() {
    if (subjects) return subjects;
    try {
        const s = JSON.parse(localStorage.getItem(SUBJECTS_KEY) || 'null');
        if (s && Array.isArray(s.names) && s.names.length) {
            subjects = { active: s.names.includes(s.active) ? s.active : s.names[0], names: s.names };
            return subjects;
        }
    } catch (e) { /* bỏ qua */ }
    // Lần đầu chạy bản đa môn: chuyển dữ liệu cũ (chỉ có 1 bộ) thành môn đầu tiên
    subjects = { active: 'Môn 1', names: ['Môn 1'] };
    try {
        const old = localStorage.getItem(GOAL_STATE_KEY);
        if (old && !localStorage.getItem(SUBJECT_PREFIX + 'Môn 1')) localStorage.setItem(SUBJECT_PREFIX + 'Môn 1', old);
    } catch (e) { /* bỏ qua */ }
    saveSubjects();
    return subjects;
}
function saveSubjects() {
    try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects)); } catch (e) { /* bỏ qua */ }
}
/** Khoá localStorage của môn đang mở. */
function goalKey() { return SUBJECT_PREFIX + loadSubjects().active; }

// Gán trong initGpaCalculator — dùng để vẽ lại chip mục tiêu sau khi đổi môn.
let syncTargetUI = () => {};

/** Vẽ hàng chip chọn môn (cuộn ngang được trên điện thoại). */
function renderSubjectChips() {
    const host = document.getElementById('subject-chips');
    if (!host) return;
    const s = loadSubjects();
    const chips = s.names.map(n => {
        const active = n === s.active;
        const cls = active
            ? 'bg-gradient-to-r from-[#FF69B4] to-[#FF8DC7] text-white border-transparent shadow-md shadow-pink-200'
            : 'bg-white text-gray-600 border-pink-100 hover:border-pink-300';
        return `<button type="button" class="subject-chip shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition touch-manipulation ${cls}" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`;
    }).join('');
    const addBtn = s.names.length < MAX_SUBJECTS
        ? '<button type="button" id="add-subject-btn" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-pink-200 text-pink-400 hover:border-pink-400 hover:text-pink-500 transition touch-manipulation"><i class="fas fa-plus mr-1"></i>Thêm môn</button>'
        : '';
    host.innerHTML = chips + addBtn;
    renderSemesterGpa();
}

/** Số tín chỉ của các môn (mặc định 1 tín = trung bình cộng thường). */
function subjectCredits() {
    const s = loadSubjects();
    if (!s.credits || typeof s.credits !== 'object') s.credits = {};
    return s.credits;
}

/** Tính GPA cả học kỳ = trung bình điểm hệ 4 các môn, có nhân tín chỉ. */
function computeSemester() {
    const s = loadSubjects();
    const credits = subjectCredits();
    const items = s.names.map(n => {
        let st = null;
        try { st = JSON.parse(localStorage.getItem(SUBJECT_PREFIX + n) || 'null'); } catch (e) { /* bỏ qua */ }
        return { name: n, cr: Math.max(0, parseFloat(credits[n]) || 1), ev: evalSavedState(st) };
    });
    const scored = items.filter(i => i.ev && i.cr > 0);
    const totalCr = scored.reduce((a, i) => a + i.cr, 0);
    const gpa = totalCr > 0 ? scored.reduce((a, i) => a + i.ev.score4 * i.cr, 0) / totalCr : null;
    const worst = scored.reduce((b, i) => (!b || i.ev.score4 < b.ev.score4 ? i : b), null);
    return { items, scored, totalCr, gpa, worst };
}

/**
 * Vẽ bảng "GPA học kỳ". `headerOnly` dùng khi đang gõ số tín chỉ — không vẽ lại
 * danh sách để ô nhập không bị mất con trỏ.
 */
function renderSemesterGpa(headerOnly) {
    const valEl = document.getElementById('semester-gpa-value');
    const subEl = document.getElementById('semester-gpa-sub');
    const host = document.getElementById('semester-gpa-body');
    if (!valEl || !host) return;

    const { items, scored, gpa, worst } = computeSemester();
    valEl.textContent = gpa === null ? '—' : gpa.toFixed(2);
    valEl.className = `ml-auto text-lg font-extrabold leading-none ${gpa === null ? 'text-gray-300' : gpa >= 3.2 ? 'text-emerald-600' : gpa >= 2.5 ? 'text-pink-500' : 'text-amber-600'}`;
    if (subEl) subEl.textContent = `${scored.length}/${items.length} môn`;
    if (headerOnly) return;

    const rows = items.map(i => {
        const isWorst = worst && scored.length > 1 && i.name === worst.name;
        const score = i.ev
            ? `<span class="text-xs font-extrabold text-gray-700">${i.ev.score4.toFixed(1)} · ${i.ev.letter}</span>`
            : '<span class="text-[11px] font-semibold text-gray-300">chưa nhập</span>';
        return `<div class="flex items-center gap-2 py-1.5 border-t border-pink-100/70">
            <span class="text-xs font-bold text-gray-700 truncate flex-1 min-w-0">${escapeHtml(i.name)}</span>
            ${isWorst ? '<i class="fas fa-arrow-trend-down text-red-400 text-xs shrink-0" title="Môn đang kéo GPA xuống nhiều nhất"></i>' : ''}
            <input type="number" inputmode="decimal" min="0" max="20" step="0.5" value="${i.cr}" data-name="${escapeHtml(i.name)}"
                class="semester-credit w-12 px-1 py-1 shrink-0 text-center text-xs font-bold text-pink-600 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200"
                aria-label="Số tín chỉ môn ${escapeHtml(i.name)}">
            <span class="text-[10px] text-gray-400 shrink-0">tín</span>
            <span class="w-20 text-right shrink-0">${score}</span>
        </div>`;
    }).join('');

    host.innerHTML = rows + `<p class="text-[11px] text-gray-400 mt-2 flex items-start gap-1.5">
        <i class="fas fa-circle-info mt-0.5"></i>
        <span>Sửa số tín chỉ cho đúng chương trình học thì GPA mới chuẩn. Môn chưa nhập điểm không được tính vào GPA.</span></p>`;
}

/** Nạp lại toàn bộ card theo môn đang chọn (cấu trúc + số liệu + kết quả). */
function loadSubjectIntoUI() {
    // Footgun: phải tắt tự lưu TRƯỚC khi vẽ lại, không thì bảng trống ghi đè mất dữ liệu môn mới
    goalStateRestored = false;
    requiredCalcDone = false;
    projReachedBefore = false;
    clearTimeout(saveGoalTimer);
    clearTimeout(autoRequiredTimer);
    examRows = {
        pretest: defaultRowsOf('pretest'),
        nopretest: defaultRowsOf('nopretest'),
        custom: defaultRowsOf('custom'),
    };
    const resultArea = document.getElementById('required-correct-result');
    if (resultArea) resultArea.innerHTML = '';
    renderSubjectChips();
    restoreGoalState();
    syncTargetUI();
}

function switchSubject(name) {
    saveGoalState(); // chốt môn đang mở trước khi rời đi
    loadSubjects().active = name;
    saveSubjects();
    loadSubjectIntoUI();
}

function addSubject() {
    const s = loadSubjects();
    const name = (prompt('Tên môn học mới:', `Môn ${s.names.length + 1}`) || '').trim().slice(0, 40);
    if (!name) return;
    if (s.names.includes(name)) { showToast('Đã có môn trùng tên rồi 🙃', 'warning'); return; }
    saveGoalState();
    s.names.push(name);
    s.active = name;
    saveSubjects();
    loadSubjectIntoUI();
    showToast(`Đã thêm môn "${name}" ✨`, 'success');
}

function renameSubject() {
    const s = loadSubjects();
    const name = (prompt('Đổi tên môn:', s.active) || '').trim().slice(0, 40);
    if (!name || name === s.active) return;
    if (s.names.includes(name)) { showToast('Đã có môn trùng tên rồi 🙃', 'warning'); return; }
    try {
        const data = localStorage.getItem(SUBJECT_PREFIX + s.active);
        if (data) localStorage.setItem(SUBJECT_PREFIX + name, data);
        localStorage.removeItem(SUBJECT_PREFIX + s.active);
    } catch (e) { /* bỏ qua */ }
    const cr = subjectCredits();
    if (cr[s.active] != null) { cr[name] = cr[s.active]; delete cr[s.active]; }
    s.names[s.names.indexOf(s.active)] = name;
    s.active = name;
    saveSubjects();
    renderSubjectChips();
    showToast('Đã đổi tên môn ✏️', 'success');
}

async function deleteSubject() {
    const s = loadSubjects();
    if (s.names.length <= 1) { showToast('Phải còn ít nhất một môn 🙂', 'warning'); return; }
    const ok = await showConfirm(`Xoá môn "${s.active}" cùng toàn bộ số liệu đã nhập?`,
        { title: 'Xoá môn học', confirmText: 'Xoá môn', tone: 'danger' });
    if (!ok) return;
    try { localStorage.removeItem(SUBJECT_PREFIX + s.active); } catch (e) { /* bỏ qua */ }
    delete subjectCredits()[s.active];
    const i = s.names.indexOf(s.active);
    s.names.splice(i, 1);
    s.active = s.names[Math.max(0, i - 1)];
    saveSubjects();
    loadSubjectIntoUI();
    showToast('Đã xoá môn 🧹', 'success');
}

/**
 * Bảng mốc: với kết quả các lần khác giữ nguyên, lần `attempt` cần bao nhiêu câu/điểm
 * để chạm TỪNG mức điểm chữ (D → A). Giúp nhìn một phát biết mình đang với tới đâu.
 * @param {object} attempt {kind, total, weight, label}
 * @param {number} otherPct Điểm đã "chốt" từ các lần khác (thang 0–100)
 */
function milestoneTableHtml(attempt, otherPct, target) {
    // Mức điểm chữ đang là mục tiêu = mức thấp nhất chạm mốc hệ 10 mong muốn
    const selTier = GRADE_TIERS.find(t => t.min10 >= target.score10 - 1e-9);
    const rows = GRADE_TIERS.map(t => {
        const needPct = t.min10 * 10 - otherPct;
        let text, state; // state: safe (chắc chắn) | ok (khả thi) | far (ngoài tầm)
        if (needPct <= 1e-9) { text = 'Chắc chắn ✓'; state = 'safe'; }
        else if (attempt.weight <= 0) { text = '—'; state = 'far'; }
        else {
            const s = (needPct / attempt.weight) * 10; // điểm hệ 10 cần ở lần này
            if (attempt.kind === 'gpa4') {
                const need = GRADE_TIERS.find(g => g.min10 >= s - 1e-9);
                if (!need) { text = 'Ngoài tầm'; state = 'far'; }
                else { text = `≥ ${need.letter}`; state = 'ok'; }
            } else if (attempt.kind === 'score') {
                if (s > 10 + 1e-9) { text = 'Ngoài tầm'; state = 'far'; }
                else { text = `≥ ${(Math.ceil(s * 100) / 100).toFixed(2)}đ`; state = 'ok'; }
            } else {
                const k = minCorrectForScore10(s, attempt.total, attempt.scale);
                if (k > attempt.total) { text = 'Ngoài tầm'; state = 'far'; }
                else { text = `≥ ${k}/${attempt.total} câu`; state = 'ok'; }
            }
        }
        const selected = selTier === t;
        const stateCls = state === 'far'
            ? 'text-gray-400 bg-gray-50 border-gray-200'
            : state === 'safe'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-gray-700 bg-white/80 border-pink-100';
        return `<div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${stateCls} ${selected ? 'ring-2 ring-pink-300' : ''}">
            <span class="font-extrabold">${t.letter} <span class="font-semibold text-[10px] opacity-60">· ${t.score4.toFixed(1)}</span></span>
            <span class="font-bold">${text}</span>
        </div>`;
    }).join('');
    return `
        <div class="mt-4 pt-3 border-t border-pink-100">
            <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2"><i class="fas fa-signal mr-1 text-pink-300"></i>Mốc từng mức điểm ở lần "${attempt.label}"</p>
            <div class="grid grid-cols-1 min-[380px]:grid-cols-2 gap-1.5">${rows}</div>
        </div>`;
}

/**
 * Tính cần đúng thêm bao nhiêu câu để lên mức điểm hệ 4 kế tiếp.
 * @returns {{need:number, atCorrect:number, letter:string, score4:number}|null}
 *          null nếu đã ở mức hệ 4 cao nhất (4.0).
 */
function nextGradeHint(x, y, currentScore4) {
    const next = GRADE_TIERS.find(t => t.score4 > currentScore4 + 1e-9);
    if (!next) return null;
    for (let k = x + 1; k <= y; k++) {
        if (score10FromCorrect(k, y) >= next.min10 - 1e-9) {
            return { need: k - x, atCorrect: k, letter: next.letter, score4: next.score4 };
        }
    }
    return null;
}

/**
 * Định dạng tổng thời gian ôn tập (giây) thành chuỗi ngắn gọn: "45p", "1g 20p", "2g".
 */
function formatStudyTime(totalSeconds) {
    const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const totalMinutes = Math.round(secs / 60);
    if (totalMinutes < 60) return `${totalMinutes}p`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}g ${minutes}p` : `${hours}g`;
}

/** Điền 4 thẻ tổng quan + các khối trực quan từ danh sách lượt làm bài. */
function paintStats(rows) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-unique-quizzes', new Set(rows.map(r => r.q).filter(Boolean)).size);
    set('stat-total-attempts', rows.length);
    set('stat-total-questions', rows.reduce((s, r) => s + (Number(r.t) || 0), 0).toLocaleString('vi-VN'));
    set('stat-total-time', formatStudyTime(rows.reduce((s, r) => s + (Number(r.d) || 0), 0)));
    renderInsights(rows);
}

/**
 * Tải và hiển thị toàn bộ trang thống kê (hoạt động ôn tập & thành tựu) của người dùng.
 *
 * Vẽ NGAY từ cache localStorage rồi mới đồng bộ phần mới từ Firestore — mở tab
 * là thấy số liệu, không phải chờ mạng. Xem features/profile/stats-insights.js.
 * @param {boolean} force true = xóa cache, kéo lại toàn bộ lịch sử (nút "Tải lại")
 */
export async function loadAndDisplayStats(force = false) {
    const user = auth.currentUser;
    const achievementsContainer = document.getElementById('achievements-container');

    // Reset giao diện thành tựu
    if (achievementsContainer) achievementsContainer.innerHTML = '';

    if (!user) {
        paintStats([]);
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-6">Vui lòng đăng nhập để xem thành tựu.</p>';
        return;
    }

    if (force === true) clearRowsCache();
    const cached = readRowsCache();
    if (cached.rows.length) paintStats(cached.rows);
    else renderInsightsSkeleton();

    try {
        // 1. Tải và hiển thị thành tựu
        const allAchievements = Object.values(achievements);
        
        if (achievementsContainer) {
            allAchievements.forEach(ach => {
                const achievementEl = document.createElement('div');
                achievementEl.className = 'flex flex-col items-center gap-2 opacity-40 grayscale transition-all duration-300 hover:scale-105';
                achievementEl.id = `achievement-${ach.name.replace(/\s/g, '-')}`;
                achievementEl.innerHTML = `
                    <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 relative group cursor-help">
                        <img src="${ach.img}" alt="${ach.name}" class="w-20 h-20 object-cover rounded-xl mx-auto">
                        <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-[10px] text-white font-medium text-center">
                            ${ach.description || 'Thành tựu đặc biệt'}
                        </div>
                    </div>
                    <p class="font-bold text-xs text-gray-700 mt-1">${ach.name}</p>
                `;
                achievementsContainer.appendChild(achievementEl);
            });
        }

        // Tải thành tựu người dùng đã mở khóa
        const achievementsQuery = query(collection(db, "users", user.uid, "achievements"));
        const achievementsSnapshot = await getDocs(achievementsQuery);
        
        if (!achievementsSnapshot.empty) {
            achievementsSnapshot.forEach(docSnap => {
                const unlockedAchievement = achievements[docSnap.id];
                if (unlockedAchievement) {
                    const targetEl = document.getElementById(`achievement-${unlockedAchievement.name.replace(/\s/g, '-')}`);
                    if (targetEl) {
                        targetEl.classList.remove('opacity-40', 'grayscale');
                        targetEl.classList.add('fade-in');
                        const imgWrapper = targetEl.querySelector('div');
                        if (imgWrapper) {
                            imgWrapper.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2');
                        }
                    }
                }
            });
        }
        
        // 2. Đồng bộ TĂNG DẦN lịch sử làm bài rồi vẽ lại (cache đã vẽ ở trên)
        const { rows, changed } = await syncRows();
        if (changed || !cached.rows.length) paintStats(rows);
    } catch (e) {
        console.error("Lỗi tải trang thống kê: ", e);
        if (achievementsContainer) achievementsContainer.innerHTML = '<p class="text-red-500 col-span-full py-6">Lỗi tải thành tựu.</p>';
        // Không có cache để vẽ thì gỡ skeleton kẻo nó nhấp nháy mãi
        if (!cached.rows.length) paintStats([]);
    }
}

/**
 * Tải danh sách các bộ đề mà người dùng đã ĐÁNH DẤU hoặc GHI CHÚ cá nhân.
 *
 * Cố ý KHÔNG tự chạy khi mở tab Thống kê — chỉ chạy khi người dùng bấm "Mở danh sách"
 * để không làm chậm việc tải trang. Mỗi bộ đề được hiển thị thành một thẻ riêng;
 * bấm vào sẽ điều hướng sang trang lịch sử/chi tiết của bộ đề đó.
 *
 * Nguồn dữ liệu: gộp localStorage (quiz_notes_/quiz_marks_/quiz_annot_) và
 * collection Firestore `quiz_study` của người dùng.
 */
export async function loadMarkedNotedQuizzes() {
    const container = document.getElementById('marked-quizzes-list');
    if (!container) return;

    // Skeleton trong lúc tải
    container.innerHTML = `
        <div class="space-y-3">
            <div class="h-20 w-full rounded-2xl bg-gray-100 animate-pulse"></div>
            <div class="h-20 w-full rounded-2xl bg-gray-100 animate-pulse"></div>
        </div>`;

    // quizId -> { notes, marks, annots }
    const stats = new Map();
    const bump = (qid, kind, n) => {
        if (!qid || qid === 'default_quiz' || !n || n <= 0) return;
        const cur = stats.get(qid) || { notes: 0, marks: 0, annots: 0 };
        cur[kind] += n;
        stats.set(qid, cur);
    };

    // 1. Quét localStorage
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const m = key && key.match(/^quiz_(notes|marks|annot)_(.+)$/);
            if (!m) continue;
            const kind = m[1];
            const qid = m[2];
            let obj = {};
            try { obj = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { obj = {}; }
            if (kind === 'notes') {
                bump(qid, 'notes', Object.values(obj).filter(v => v && String(v).trim() !== '').length);
            } else if (kind === 'marks') {
                bump(qid, 'marks', Object.values(obj).filter(v => !!v).length);
            } else {
                bump(qid, 'annots', Object.values(obj).filter(v => Array.isArray(v) && v.length > 0).length);
            }
        }
    } catch (e) { /* localStorage không khả dụng */ }

    // 2. Quét cloud (quiz_study của người dùng hiện tại)
    const user = auth.currentUser;
    if (user) {
        try {
            const q = query(collection(db, 'quiz_study'), where('userId', '==', user.uid));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const data = d.data() || {};
                const qid = data.quizId;
                bump(qid, 'notes', (data.notes || []).filter(n => n && String(n.text || '').trim() !== '').length);
                bump(qid, 'marks', (data.marks || []).filter(mk => mk && mk.reason).length);
                bump(qid, 'annots', (data.annotations || []).filter(a => a && Array.isArray(a.items) && a.items.length > 0).length);
            });
        } catch (e) {
            console.warn('Không tải được danh sách bộ đề đã đánh dấu/ghi chú:', e);
        }
    }

    const quizIds = Array.from(stats.keys());
    if (quizIds.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <i class="fas fa-inbox text-3xl block mb-3 text-gray-300"></i>
                <p class="text-sm font-medium">Bạn chưa đánh dấu hay ghi chú ở bộ đề nào.</p>
                <p class="text-xs mt-1">Trong lúc làm bài, hãy đánh dấu câu hỏi hoặc thêm ghi chú để chúng xuất hiện ở đây.</p>
            </div>`;
        return;
    }

    // 3. Lấy tiêu đề từng bộ đề (bỏ qua bộ đề đã bị xoá)
    const titles = {};
    await Promise.all(quizIds.map(async qid => {
        try {
            const snap = await getDoc(doc(db, 'quiz_sets', qid));
            titles[qid] = snap.exists() ? (snap.data().title || 'Bộ đề không tên') : null;
        } catch (e) {
            titles[qid] = 'Bộ đề không tên';
        }
    }));

    // 4. Render — mỗi bộ đề một thẻ riêng, bấm vào → trang lịch sử/chi tiết
    const badge = (icon, count, label, color, bg) =>
        `<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style="color:${color};background:${bg}">
            <i class="fas ${icon}"></i>${count} ${label}
        </span>`;

    const cards = quizIds
        .filter(qid => titles[qid] !== null)
        .sort((a, b) => titles[a].localeCompare(titles[b], 'vi'))
        .map(qid => {
            const s = stats.get(qid);
            const badges = [];
            if (s.marks > 0) badges.push(badge('fa-bookmark', s.marks, 'đánh dấu', '#b91c1c', '#fee2e2'));
            if (s.notes > 0) badges.push(badge('fa-sticky-note', s.notes, 'ghi chú', '#0369a1', '#e0f2fe'));
            if (s.annots > 0) badges.push(badge('fa-highlighter', s.annots, 'bôi vàng', '#a16207', '#fef9c3'));
            return `
                <a href="features/quiz/quiz-history.html?id=${encodeURIComponent(qid)}"
                    class="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/40 transition group">
                    <div class="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 text-purple-500 flex items-center justify-center">
                        <i class="fas fa-book-open"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-gray-800 truncate group-hover:text-purple-700">${titles[qid]}</p>
                        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">${badges.join('')}</div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-300 group-hover:text-purple-400 transition"></i>
                </a>`;
        }).join('');

    container.innerHTML = cards
        ? `<div class="space-y-3">${cards}</div>`
        : `<div class="text-center py-10 text-gray-400">
                <i class="fas fa-inbox text-3xl block mb-3 text-gray-300"></i>
                <p class="text-sm font-medium">Các bộ đề đã đánh dấu/ghi chú không còn tồn tại.</p>
           </div>`;
}

/**
 * Xử lý sự kiện nút bấm tính điểm GPA hệ 4 trên UI
 */
export function calculateGPA(opts) {
    const silent = !!(opts && opts.silent === true);
    const correctAnswersInput = document.getElementById('correct-answers');
    const totalQuestionsInput = document.getElementById('total-questions');
    const resultArea = document.getElementById('gpa-result-area');

    if (!correctAnswersInput || !totalQuestionsInput || !resultArea) return;

    const xRaw = correctAnswersInput.value.trim();
    const yRaw = totalQuestionsInput.value.trim();
    const x = parseInt(xRaw, 10);
    const y = parseInt(yRaw, 10);

    if (isNaN(x) || isNaN(y) || y <= 0 || x < 0 || x > y) {
        // Khi đang gõ (silent): không làm phiền bằng toast/viền đỏ; chỉ ẩn kết quả nếu còn thiếu dữ liệu.
        if (silent) {
            if (xRaw === '' || yRaw === '') resultArea.classList.add('hidden');
            return;
        }
        showToast('Vui lòng nhập số câu hợp lệ!', 'warning');
        correctAnswersInput.classList.add('border-red-400');
        totalQuestionsInput.classList.add('border-red-400');
        return;
    }
    correctAnswersInput.classList.remove('border-red-400');
    totalQuestionsInput.classList.remove('border-red-400');

    const score10 = score10FromCorrect(x, y);

    let score4, letterGrade, motivation, img, gradeBg, gradeColor, gradeBorder, gradeEmoji;
    const { score4: calc4, letterGrade: calcLetter } = calculateGPAFromPercent(score10 * 10);
    score4 = calc4;
    letterGrade = calcLetter;

    if (score10 >= 9.5) {
        img = 'assets/squirrel_A.png';
        motivation = "Ối dồi ôi, ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
        gradeBg = 'from-yellow-50 to-amber-50'; gradeColor = 'text-amber-500'; gradeBorder = 'border-amber-300'; gradeEmoji = '🏆';
    } else if (score10 >= 8.5) {
        img = 'assets/squirrel_A.png';
        motivation = "Dỏi dữ dị bà, trộm vía trộm víaaaaaa, xin vía 4.0 <3";
        gradeBg = 'from-yellow-50 to-orange-50'; gradeColor = 'text-orange-400'; gradeBorder = 'border-orange-300'; gradeEmoji = '🌟';
    } else if (score10 >= 8.0) {
        img = 'assets/squirrel_B.png';
        motivation = "gút chóp bây bề";
        gradeBg = 'from-green-50 to-emerald-50'; gradeColor = 'text-emerald-500'; gradeBorder = 'border-emerald-300'; gradeEmoji = '✨';
    } else if (score10 >= 7.0) {
        img = 'assets/squirrel_B.png';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
        gradeBg = 'from-green-50 to-teal-50'; gradeColor = 'text-teal-500'; gradeBorder = 'border-teal-300'; gradeEmoji = '💚';
    } else if (score10 >= 6.5) {
        img = 'assets/squirrel_C.png';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
        gradeBg = 'from-blue-50 to-sky-50'; gradeColor = 'text-sky-500'; gradeBorder = 'border-sky-300'; gradeEmoji = '💙';
    } else if (score10 >= 5.5) {
        img = 'assets/squirrel_C.png';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
        gradeBg = 'from-pink-50 to-rose-50'; gradeColor = 'text-rose-400'; gradeBorder = 'border-rose-300'; gradeEmoji = '🌸';
    } else if (score10 >= 5.0) {
        img = 'assets/squirrel_D.png';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
        gradeBg = 'from-purple-50 to-violet-50'; gradeColor = 'text-violet-500'; gradeBorder = 'border-violet-300'; gradeEmoji = '🔮';
    } else if (score10 >= 4.0) {
        img = 'assets/squirrel_D.png';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
        gradeBg = 'from-orange-50 to-yellow-50'; gradeColor = 'text-yellow-500'; gradeBorder = 'border-yellow-300'; gradeEmoji = '🌻';
    } else {
        img = 'assets/squirrel_F.png';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
        gradeBg = 'from-gray-50 to-slate-50'; gradeColor = 'text-gray-500'; gradeBorder = 'border-gray-300'; gradeEmoji = '🐿️';
    }

    const percentage = Math.round((x / y) * 100);

    // Gợi ý: còn bao nhiêu câu nữa là lên mức điểm hệ 4 kế tiếp
    const hint = nextGradeHint(x, y, score4);
    let hintHtml = '';
    if (hint) {
        hintHtml = `
            <div class="w-full mt-1 text-center text-sm font-semibold text-gray-700 bg-white/70 rounded-xl py-2.5 px-3 shadow-sm">
                <i class="fas fa-arrow-trend-up text-emerald-500 mr-1"></i>
                Cố thêm <b class="text-emerald-600">${hint.need}</b> câu nữa (đúng <b>${hint.atCorrect}/${y}</b>) là lên <b>${hint.letter}</b> · hệ 4 <b>${hint.score4.toFixed(1)}</b> 🎯
            </div>`;
    } else if (score4 >= 4.0) {
        hintHtml = `
            <div class="w-full mt-1 text-center text-sm font-semibold text-amber-600 bg-white/70 rounded-xl py-2.5 px-3 shadow-sm">
                🏆 Bạn đang ở mức điểm hệ 4 cao nhất (4.0) rồi!
            </div>`;
    }

    // Thanh "thang hệ 10" chia vùng theo điểm chữ + kim chỉ vị trí hiện tại — nhìn phát biết mình đang ở đâu
    const ZONES = [
        { to: 4.0, cls: 'bg-gray-300', label: 'F' },
        { to: 5.5, cls: 'bg-violet-300', label: 'D' },
        { to: 7.0, cls: 'bg-sky-300', label: 'C' },
        { to: 8.5, cls: 'bg-emerald-300', label: 'B' },
        { to: 10, cls: 'bg-amber-300', label: 'A' },
    ];
    let zoneFrom = 0;
    const zoneHtml = ZONES.map(z => {
        const seg = `<div class="h-full ${z.cls} flex items-center justify-center" style="width:${(z.to - zoneFrom) * 10}%"><span class="text-[9px] font-extrabold text-white drop-shadow-sm">${z.label}</span></div>`;
        zoneFrom = z.to;
        return seg;
    }).join('');
    const markerLeft = Math.max(0, Math.min(100, score10 * 10));

    resultArea.className = `mt-6 p-4 sm:p-6 rounded-2xl border-2 bg-gradient-to-br ${gradeBg} ${gradeBorder} transition-all duration-500`;
    resultArea.innerHTML = `
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-4">
                <div class="relative shrink-0">
                    <img src="${img}" alt="Sóc con" class="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-lg animate-bounce" style="animation-duration:2s">
                    <span class="absolute -top-1 -right-1 text-2xl">${gradeEmoji}</span>
                </div>
                <div class="min-w-0 flex-1">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Điểm hệ 4</span>
                    <div class="flex items-end gap-2 flex-wrap mt-0.5">
                        <span class="${gradeColor} text-6xl font-extrabold leading-none drop-shadow-sm">${score4.toFixed(1)}</span>
                        <span class="text-lg font-bold text-gray-400 leading-none mb-0.5">/ 4</span>
                        <span class="${gradeColor} text-base font-extrabold bg-white/80 rounded-full px-3 py-1 shadow-sm mb-0.5">${letterGrade}</span>
                    </div>
                    <p class="text-xs sm:text-sm font-semibold text-gray-600 italic mt-2 leading-relaxed">"${motivation}"</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 sm:gap-3 w-full">
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-2 py-2.5">
                    <span class="text-[10px] text-gray-500 font-semibold mb-0.5 uppercase tracking-wide">Hệ 10</span>
                    <span class="${gradeColor} text-2xl font-extrabold">${score10.toFixed(2)}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-2 py-2.5">
                    <span class="text-[10px] text-gray-500 font-semibold mb-0.5 uppercase tracking-wide">Câu đúng</span>
                    <span class="${gradeColor} text-2xl font-extrabold">${x}/${y}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-2 py-2.5">
                    <span class="text-[10px] text-gray-500 font-semibold mb-0.5 uppercase tracking-wide">Tỉ lệ</span>
                    <span class="${gradeColor} text-2xl font-extrabold">${percentage}%</span>
                </div>
            </div>
            <div class="w-full">
                <div class="relative mt-1">
                    <div class="w-full h-5 rounded-full overflow-hidden flex shadow-inner">${zoneHtml}</div>
                    <div class="absolute -top-1 h-7 w-1 rounded-full bg-gray-700 shadow" style="left:calc(${markerLeft}% - 2px)"></div>
                </div>
                <div class="flex justify-between text-[10px] text-gray-400 mt-1 font-semibold">
                    <span>0</span>
                    <span>Điểm hệ 10 của bạn: <b class="text-gray-600">${score10.toFixed(2)}</b></span>
                    <span>10</span>
                </div>
            </div>
            ${hintHtml}
        </div>
    `;

    resultArea.classList.remove('hidden');
    setTimeout(() => resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

/**
 * Quy đổi điểm hệ 4 mong muốn -> điểm hệ 10 tối thiểu cần đạt.
 * Lấy đúng các ngưỡng trong bảng chuẩn calculateGPAFromPercent để không bị lệch.
 * @param {number} targetGpa4 Điểm hệ 4 mong muốn (1.0 - 4.0)
 * @returns {number} Điểm hệ 10 tối thiểu để đạt được GPA đó
 */
function minScore10ForGpa4(targetGpa4) {
    // Sắp xếp theo GPA tăng dần; ngưỡng hệ 10 là biên dưới của mỗi mức điểm chữ.
    const table = [
        { min10: 4.0, gpa: 1.0 }, // D
        { min10: 5.0, gpa: 1.5 }, // D+
        { min10: 5.5, gpa: 2.0 }, // C
        { min10: 6.5, gpa: 2.5 }, // C+
        { min10: 7.0, gpa: 3.0 }, // B
        { min10: 8.0, gpa: 3.5 }, // B+
        { min10: 8.5, gpa: 4.0 }, // A
    ];
    for (const row of table) {
        if (row.gpa >= targetGpa4 - 1e-9) return row.min10;
    }
    return 8.5;
}

/**
 * Tính số câu cần đúng ở các lần thi còn lại để đạt điểm hệ 4 mong muốn.
 *
 * Mô hình chuẩn hoá: mỗi lần thi có trọng số w_i (%) và hiệu suất p_i ∈ [0,1], tuỳ cách
 * tính điểm riêng của lần đó (câu đúng theo thang UMP/tuyến tính, điểm hệ 10, hoặc điểm chữ).
 * Điểm tổng kết (thang 0–100) = Σ p_i * w_i, với Σ w_i = 100.
 */
export function calculateRequiredCorrectAnswers(opts) {
    const silent = !!(opts && opts.silent === true);
    const resultArea = document.getElementById('required-correct-result');
    if (!resultArea) return;

    const showError = (msg) => {
        if (silent) return; // đang gõ dở: giữ kết quả cũ, không chen lỗi vào
        requiredCalcDone = true;
        resultArea.innerHTML = `
            <div class="rounded-2xl border border-red-200 bg-red-50 overflow-hidden shadow-sm">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-red-200">
                    <span class="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-sm shrink-0"><i class="fas fa-circle-exclamation"></i></span>
                    <span class="font-extrabold text-red-700 text-sm">Chưa thể tính</span>
                </div>
                <div class="px-4 py-4 text-sm text-gray-700 leading-relaxed">${msg}</div>
            </div>`;
    };

    // 1. Thu thập dữ liệu từng lần thi từ bảng
    const rowEls = Array.from(document.querySelectorAll('#attempts-table .attempt-row'));
    if (rowEls.length === 0) { showError('Chưa có bảng các lần thi. Vui lòng chọn loại kỳ thi.'); return; }

    const attempts = rowEls.map(readAttemptRow);
    const bad = attempts.find(a => a.err);
    if (bad) { showError(bad.err); return; }

    const weightSum = attempts.reduce((s, a) => s + a.weight, 0);
    if (Math.round(weightSum) !== 100) {
        showError(`Tổng trọng số các lần thi phải bằng <b>100%</b> (hiện tại đang là ${Math.round(weightSum * 100) / 100}%).`);
        return;
    }

    // 2. Mục tiêu (thang 0–100, = điểm hệ 10 × 10) — hệ 4 hoặc hệ 10 tuỳ chế độ đang chọn
    const target = getTarget();
    if (target.score10 <= 0) { showError('Vui lòng chọn mục tiêu lớn hơn 0.'); return; }
    const targetScore10 = target.score10;
    const targetPct = targetScore10 * 10;

    const knownPct = attempts.filter(a => a.p !== null).reduce((s, a) => s + a.p * a.weight, 0);
    const unknown = attempts.filter(a => a.p === null);
    const neededPct = targetPct - knownPct;

    // Bộ khung hiển thị kết quả: header trạng thái + nội dung + chân nhắc mục tiêu (đồng nhất mọi nhánh)
    const TONES = {
        success: { bg: 'bg-emerald-50', border: 'border-emerald-200', head: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
        info:    { bg: 'bg-pink-50',    border: 'border-pink-200',    head: 'text-pink-700',    iconBg: 'bg-pink-100 text-pink-600' },
        warn:    { bg: 'bg-amber-50',   border: 'border-amber-200',   head: 'text-amber-700',   iconBg: 'bg-amber-100 text-amber-600' },
        danger:  { bg: 'bg-red-50',     border: 'border-red-200',     head: 'text-red-700',     iconBg: 'bg-red-100 text-red-600' },
    };
    const render = ({ tone, icon, title, body }) => {
        requiredCalcDone = true; // từ giờ kết quả sẽ tự cập nhật khi chỉnh số liệu
        const t = TONES[tone];
        resultArea.innerHTML = `
            <div class="result-card rounded-2xl border ${t.border} ${t.bg} overflow-hidden shadow-sm">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b ${t.border}">
                    <span class="w-8 h-8 rounded-xl ${t.iconBg} flex items-center justify-center text-sm shrink-0"><i class="fas ${icon}"></i></span>
                    <span class="font-extrabold ${t.head} text-sm">${title}</span>
                </div>
                <div class="px-4 py-4 text-sm text-gray-700 leading-relaxed">${body}</div>
                <div class="flex items-center gap-1.5 px-4 py-2.5 bg-white/60 border-t ${t.border} text-xs text-gray-500">
                    <i class="fas fa-bullseye text-pink-400"></i>
                    <span>Mục tiêu ${targetText(target)}</span>
                </div>
            </div>
            <button type="button" id="copy-required-btn"
                class="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-pink-100 text-xs font-bold text-gray-500 hover:text-pink-500 hover:border-pink-300 active:scale-[0.98] transition touch-manipulation">
                <i class="fas fa-copy"></i> Sao chép kết quả
            </button>`;
        // Bấm nút tính (không phải auto-update) thì đưa kết quả vào tầm nhìn — quan trọng trên mobile
        if (!silent) setTimeout(() => resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    };
    // Khối "số to" cho con số cần đạt
    const heroNumber = (big, unit, badge) => `
        <div class="flex items-end gap-2">
            <span class="text-4xl font-extrabold text-pink-500 leading-none">${big}</span>
            <span class="text-base font-bold text-gray-400 mb-0.5">${unit}</span>
            ${badge ? `<span class="ml-auto text-sm font-bold text-pink-600 bg-pink-100 rounded-full px-2.5 py-1">${badge}</span>` : ''}
        </div>`;
    // Ba ô điểm hệ 10 / hệ 4 / điểm chữ
    const statChips = (s10, s4, letter, tone) => {
        const t = TONES[tone];
        const chip = (lbl, val, hero) => `<div class="px-3 py-1.5 rounded-xl text-center ${hero ? `bg-white border-2 ${t.border} shadow-sm` : `bg-white/70 border ${t.border}`}"><span class="text-[10px] text-gray-400 font-semibold block">${lbl}</span><b class="${hero ? `text-xl ${t.head}` : 'text-base text-gray-800'}">${val}</b></div>`;
        return `<div class="flex flex-wrap items-stretch gap-2">${chip('HỆ 4', s4, true)}${chip('HỆ 10', s10)}${chip('ĐIỂM CHỮ', letter)}</div>`;
    };
    // Lần thi nhập điểm chữ: điểm hệ 10 cần -> mức chữ thấp nhất đạt được (null = ngoài tầm)
    const letterFor = (s10) => GRADE_TIERS.find(g => g.min10 >= s10 - 1e-9);

    // 3a. Đã nhập đủ tất cả -> báo kết quả tổng kết
    if (unknown.length === 0) {
        const finalScore10 = knownPct / 10;
        const { score4, letterGrade } = calculateGPAFromPercent(knownPct);
        const reached = knownPct >= targetPct - 1e-9;

        if (reached) {
            render({
                tone: 'success', icon: 'fa-trophy', title: 'Đã đạt mục tiêu! 🎉',
                body: `${statChips(finalScore10.toFixed(2), score4.toFixed(1), letterGrade, 'success')}
                       <p class="mt-3 font-semibold text-emerald-600">Kết quả hiện tại đã đủ để đạt mục tiêu. Tuyệt vời! 🐿️</p>`
            });
            return;
        }

        // Chưa đạt: lấy lần thi có trọng số lớn nhất làm "đòn bẩy", gợi ý số câu cần đúng ở lần đó
        // (giữ nguyên kết quả các lần khác) để biết cụ thể cần làm bao nhiêu câu mới chạm mục tiêu.
        const ratioAttempts = attempts.filter(a => a.kind === 'ratio');
        const pool = ratioAttempts.length ? ratioAttempts : attempts;
        const lever = pool.reduce((best, a) => (a.weight > best.weight ? a : best), pool[0]);
        const otherPct = knownPct - lever.p * lever.weight;            // điểm các lần khác (giữ nguyên)
        const neededFromLever = targetPct - otherPct;                  // phần cần bù từ lần đòn bẩy
        const neededP = lever.weight > 0 ? neededFromLever / lever.weight : Infinity;
        const chips = statChips(finalScore10.toFixed(2), score4.toFixed(1), letterGrade, 'warn');

        if (lever.kind === 'gpa4') {
            const need = letterFor(neededP * 10);
            if (!need) {
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `${chips}<p class="mt-3 text-gray-600">Dù đạt <b>A</b> ở lần "<b>${lever.label}</b>", điểm tổng kết vẫn chưa chạm mục tiêu.</p>
                           ${milestoneTableHtml(lever, otherPct, target)}` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Để đạt mục tiêu cần',
                    body: `${chips}<div class="mt-3">${heroNumber(need.letter, `· hệ 4 ${need.score4.toFixed(1)}`, `≥ ${need.min10.toFixed(1)} hệ 10`)}</div>
                           <p class="mt-2 text-gray-500">Điểm chữ tối thiểu ở lần <b class="text-gray-700">${lever.label}</b>, giữ nguyên các lần khác.</p>
                           ${milestoneTableHtml(lever, otherPct, target)}` });
            }
            return;
        }

        if (lever.kind === 'score') {
            const needScore = Math.ceil(neededP * 10 * 100) / 100;
            const cur = lever.p * 10;
            if (needScore > 10) {
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `${chips}<p class="mt-3 text-gray-600">Dù đạt <b>10/10</b> điểm ở lần "<b>${lever.label}</b>", điểm tổng kết vẫn chưa chạm mục tiêu.</p>
                           ${milestoneTableHtml(lever, otherPct, target)}` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Để đạt mục tiêu cần',
                    body: `${chips}<div class="mt-3">${heroNumber(needScore.toFixed(2), '/ 10 điểm', '+' + Math.max(0, needScore - cur).toFixed(2) + 'đ nữa')}</div>
                           <p class="mt-2 text-gray-500">Ở lần <b class="text-gray-700">${lever.label}</b> cần đạt bấy nhiêu điểm (đang ${cur.toFixed(2)}/10), giữ nguyên các lần khác.</p>
                           ${milestoneTableHtml(lever, otherPct, target)}` });
            }
            return;
        }

        const needCorrect = minCorrectForScore10(neededP * 10, lever.total, lever.scale);
        const cur = lever.correct;
        if (needCorrect > lever.total) {
            render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                body: `${chips}<p class="mt-3 text-gray-600">Dù đúng cả <b>${lever.total}/${lever.total}</b> câu ở lần "<b>${lever.label}</b>", điểm tổng kết vẫn chưa chạm mục tiêu.</p>
                       ${milestoneTableHtml(lever, otherPct, target)}` });
            return;
        }
        const acc = Math.round((needCorrect / lever.total) * 100);
        render({ tone: 'info', icon: 'fa-bullseye', title: 'Để đạt mục tiêu cần',
            body: `${chips}
                   <div class="mt-3">${heroNumber(needCorrect, `/ ${lever.total} câu`, '+' + Math.max(0, needCorrect - cur) + ' câu nữa')}</div>
                   <p class="mt-2 text-gray-500">Số câu đúng tối thiểu ở lần <b class="text-gray-700">${lever.label}</b> (đang ${cur}/${lever.total} · ≈ ${acc}% bài), giữ nguyên các lần khác.</p>
                   <div class="mt-3 w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div class="h-full bg-pink-400 rounded-full transition-all duration-500" style="width:${acc}%"></div></div>
                   ${milestoneTableHtml(lever, otherPct, target)}` });
        return;
    }

    // 3b. Đã chắc chắn đạt dù các lần còn lại được 0 điểm
    if (neededPct <= 1e-9) {
        render({
            tone: 'success', icon: 'fa-circle-check', title: 'Chắc suất đạt mục tiêu! 🎉',
            body: `Kết quả các lần đã thi đã đủ để đạt mục tiêu ${targetText(target)} — kể cả khi các lần còn lại được 0 điểm. Quá đỉnh! 🐿️`
        });
        return;
    }

    // 3c. Còn đúng 1 lần chưa nhập -> giải chính xác
    if (unknown.length === 1) {
        const a = unknown[0];
        if (a.weight <= 0) {
            render({ tone: 'warn', icon: 'fa-triangle-exclamation', title: 'Không thể bù điểm',
                body: `Lần "<b>${a.label}</b>" có trọng số <b>0%</b> nên không ảnh hưởng tới điểm tổng kết.` });
            return;
        }
        const neededP = neededPct / a.weight; // hiệu suất cần ở lần này

        if (a.kind === 'gpa4') {
            const need = letterFor(neededP * 10);
            if (!need) {
                const maxScore10 = (knownPct + a.weight) / 10;
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `Dù đạt <b>A</b> ở lần "<b>${a.label}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).
                           ${milestoneTableHtml(a, knownPct, target)}` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Điểm chữ cần đạt',
                    body: `${heroNumber(need.letter, `· hệ 4 ${need.score4.toFixed(1)}`, `≥ ${need.min10.toFixed(1)} hệ 10`)}
                           <p class="mt-2 text-gray-500">Mức điểm chữ tối thiểu ở lần <b class="text-gray-700">${a.label}</b> để đạt mục tiêu.</p>
                           ${milestoneTableHtml(a, knownPct, target)}` });
            }
            return;
        }

        if (a.kind === 'score') {
            const needScore = Math.ceil(neededP * 10 * 100) / 100; // điểm hệ 10, làm tròn lên 2 số lẻ
            if (needScore > 10) {
                const maxScore10 = (knownPct + a.weight) / 10;
                render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                    body: `Dù đạt <b>10/10</b> điểm ở lần "<b>${a.label}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).
                           ${milestoneTableHtml(a, knownPct, target)}` });
            } else {
                render({ tone: 'info', icon: 'fa-bullseye', title: 'Điểm cần đạt',
                    body: `${heroNumber(needScore.toFixed(2), '/ 10 điểm', null)}
                           <p class="mt-2 text-gray-500">Điểm hệ 10 tối thiểu ở lần <b class="text-gray-700">${a.label}</b> để đạt mục tiêu.</p>
                           ${milestoneTableHtml(a, knownPct, target)}` });
            }
            return;
        }

        const needCorrect = minCorrectForScore10(neededP * 10, a.total, a.scale);
        if (needCorrect > a.total) {
            const maxScore10 = (knownPct + a.weight) / 10;
            render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
                body: `Dù đúng cả <b>${a.total}/${a.total}</b> câu ở lần "<b>${a.label}</b>", điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).
                       ${milestoneTableHtml(a, knownPct, target)}` });
            return;
        }
        const acc = Math.round((needCorrect / a.total) * 100);
        render({ tone: 'info', icon: 'fa-bullseye', title: 'Số câu cần đạt',
            body: `${heroNumber(needCorrect, `/ ${a.total} câu`, '≈ ' + acc + '%')}
                   <p class="mt-2 text-gray-500">Số câu đúng tối thiểu ở lần <b class="text-gray-700">${a.label}</b> để đạt mục tiêu.</p>
                   <div class="mt-3 w-full h-2 bg-white rounded-full overflow-hidden shadow-inner"><div class="h-full bg-pink-400 rounded-full transition-all duration-500" style="width:${acc}%"></div></div>
                   ${milestoneTableHtml(a, knownPct, target)}` });
        return;
    }

    // 3d. Còn nhiều lần chưa nhập -> gợi ý theo mức "đúng đều" giữa các lần
    const unknownWeight = unknown.reduce((s, a) => s + a.weight, 0);
    if (unknownWeight <= 0) {
        render({ tone: 'warn', icon: 'fa-triangle-exclamation', title: 'Không thể bù điểm',
            body: 'Các lần còn lại có tổng trọng số <b>0%</b> nên không ảnh hưởng tới điểm tổng kết.' });
        return;
    }
    const reqRatio = neededPct / unknownWeight; // hiệu suất đồng đều cần ở các lần còn lại

    if (reqRatio > 1 + 1e-9) {
        const maxScore10 = (knownPct + unknownWeight) / 10;
        render({ tone: 'danger', icon: 'fa-circle-xmark', title: 'Ngoài tầm với 😢',
            body: `Dù đạt điểm tuyệt đối ở tất cả các lần còn lại, điểm tổng kết tối đa chỉ đạt <b>${maxScore10.toFixed(2)}</b> (hệ 10).` });
        return;
    }

    const reqScore10 = reqRatio * 10; // điểm hệ 10 cần đạt đều ở mỗi lần còn lại
    const rows = unknown.map(a => {
        let val;
        if (a.kind === 'gpa4') {
            const need = letterFor(reqScore10);
            val = need ? `≥ ${need.letter}` : 'A';
        } else if (a.kind === 'score') {
            val = Math.min(10, Math.ceil(reqScore10 * 100) / 100).toFixed(2) + ' điểm';
        } else {
            const needCorrect = Math.min(a.total, minCorrectForScore10(reqScore10, a.total, a.scale));
            val = `${needCorrect}/${a.total} câu`;
        }
        return `<div class="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2 border border-pink-200">
            <span class="font-semibold text-gray-700"><i class="fas fa-circle-dot text-pink-300 mr-1.5 text-[10px]"></i>${a.label}</span>
            <span class="font-bold text-pink-600">${val}</span>
        </div>`;
    }).join('');

    render({ tone: 'info', icon: 'fa-lightbulb', title: `Gợi ý cho ${unknown.length} lần còn lại`,
        body: `<div class="inline-flex items-center gap-1.5 text-pink-600 bg-pink-100 rounded-full px-3 py-1 text-xs font-bold mb-3"><i class="fas fa-wave-square"></i> Giữ phong độ đều ≈ ${reqScore10.toFixed(1)}/10 điểm mỗi lần</div>
               <div class="space-y-1.5">${rows}</div>
               <p class="text-xs text-gray-400 mt-3">💡 Phương án cân bằng — lần này làm tốt hơn thì lần sau có thể nhẹ nhàng hơn.</p>` });
}

// Icon gợi nhớ cho từng loại bài thi
const ATTEMPT_ICONS = { 'Pretest': 'fa-vial', 'Giữa kỳ': 'fa-pen-fancy', 'Cuối kỳ': 'fa-flag-checkered' };

// Màu các khúc trên thanh trọng số (lặp lại khi có nhiều đợt)
const WEIGHT_SEG_COLORS = ['bg-pink-400', 'bg-rose-300', 'bg-violet-300', 'bg-sky-300', 'bg-amber-300', 'bg-emerald-300'];

/**
 * Thanh trọng số: nhìn một phát biết đợt nào "nặng" và đã đủ 100% chưa.
 * Nếu tổng vượt 100% thì thu nhỏ theo tổng để không tràn, đồng thời viền đỏ báo lỗi.
 */
function weightBarHtml(rows) {
    const sum = rows.reduce((a, r) => a + (parseFloat(r.weight) || 0), 0);
    const denom = Math.max(100, sum) || 100;
    const segs = rows.map((r, i) => {
        const w = parseFloat(r.weight) || 0;
        if (w <= 0) return '';
        const pct = (w / denom) * 100;
        const label = escapeHtml(r.label || '');
        return `<div class="${WEIGHT_SEG_COLORS[i % WEIGHT_SEG_COLORS.length]} flex items-center justify-center min-w-0 px-1" title="${label}: ${w}%">
            <span class="text-[10px] font-extrabold text-white truncate">${pct >= 18 ? label + ' · ' : ''}${w}%</span>
        </div>`;
    }).join('');
    // Style width phải đặt riêng để không bị escapeHtml đụng vào; dùng flex-basis cho gọn
    const widths = rows.map(r => (parseFloat(r.weight) || 0) / denom * 100);
    const rest = sum < 100 - 1e-9
        ? `<div class="flex-1 flex items-center justify-center min-w-0 px-1"><span class="text-[10px] font-bold text-gray-400 truncate">thiếu ${Math.round((100 - sum) * 100) / 100}%</span></div>`
        : '';
    const html = `<div class="flex h-7 rounded-xl overflow-hidden bg-gray-100 border ${Math.round(sum) === 100 ? 'border-pink-100' : 'border-red-300'}">${segs}${rest}</div>`;
    return { html, widths };
}

/** Vẽ thanh trọng số vào #attempts-weight-bar (đặt width bằng JS, tránh nhét style vào chuỗi HTML). */
function renderWeightBar(rows) {
    const host = document.getElementById('attempts-weight-bar');
    if (!host) return;
    const { html, widths } = weightBarHtml(rows);
    host.innerHTML = html;
    const segEls = host.querySelectorAll(':scope > div > div');
    let k = 0;
    rows.forEach((r, i) => {
        if ((parseFloat(r.weight) || 0) <= 0) return;
        const el = segEls[k++];
        if (el) el.style.width = `${widths[i]}%`;
    });
}

/**
 * Thu gọn / mở lại một thẻ lần thi. Thu gọn chỉ ẩn phần thân (giá trị vẫn nằm nguyên
 * trong DOM) nên không ảnh hưởng tới capture/apply hay việc tính điểm.
 */
function setRowCollapsed(rowEl, collapsed) {
    if (!rowEl) return;
    rowEl.classList.toggle('is-collapsed', collapsed);
    rowEl.querySelector('.attempt-body')?.classList.toggle('hidden', collapsed);
    rowEl.querySelector('.attempt-weight-badge')?.classList.toggle('hidden', !collapsed);
    rowEl.querySelector('.attempt-collapse i')?.classList.toggle('rotate-180', collapsed);
}

// Giá trị của ô chọn "cách tính điểm" (gộp kind + scale làm một lựa chọn cho gọn)
const kindValue = (row) => (row.kind === 'ratio' ? `ratio:${row.scale === 'linear' ? 'linear' : 'ump'}` : row.kind);

/**
 * Render các thẻ "lần thi" (dạng card, thân thiện mobile) trong công cụ tính điểm GPA.
 * Mỗi thẻ có thanh trượt (slider) để chọn nhanh số câu đúng / điểm, cập nhật điểm tổng kết tức thì.
 */
export function renderAttemptsTable() {
    const tableContainer = document.getElementById('attempts-table');
    if (!tableContainer || !document.getElementById('exam-type')) return;

    const rows = currentRows();
    const pillHtml = '<span class="attempt-live text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">Chưa thi</span>';
    const totalChips = [30, 40, 50, 60, 100]
        .map(n => `<button type="button" class="attempt-total-chip px-2 py-1 rounded-lg border border-pink-100 bg-pink-50/50 text-[11px] font-bold text-gray-500 hover:border-pink-300 hover:text-pink-500 active:scale-95 transition" data-total="${n}">${n}</button>`)
        .join('');

    const cardsHtml = rows.map((row, idx) => {
        const icon = ATTEMPT_ICONS[row.label] || 'fa-layer-group';
        const safeLabel = escapeHtml(row.label);
        const kv = kindValue(row);
        const opt = (v, text) => `<option value="${v}" ${kv === v ? 'selected' : ''}>${text}</option>`;
        const removeBtn = rows.length > 1
            ? `<button type="button" class="attempt-remove w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition" title="Xoá lần thi này" aria-label="Xoá lần thi"><i class="fas fa-trash-can text-xs"></i></button>`
            : '';

        // Mọi loại kỳ thi đều sửa được: tên, cách tính điểm, trọng số, thêm/xoá
        const header = `
            <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-100 to-rose-100 text-pink-500 flex items-center justify-center text-xs shrink-0"><i class="fas ${icon}"></i></span>
                <input type="text" maxlength="30" value="${safeLabel}" aria-label="Tên lần thi" placeholder="Tên lần thi"
                    class="attempt-label flex-1 min-w-0 px-2 py-1 -ml-1 text-sm font-bold text-gray-800 bg-transparent border border-transparent border-b-pink-100 rounded-lg focus:bg-white focus:border-pink-200 focus:outline-none transition">
                <span class="attempt-weight-badge hidden text-[10px] font-bold text-gray-400 shrink-0">${row.weight}%</span>
                ${pillHtml}
                <button type="button" class="attempt-collapse w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:text-pink-500 hover:bg-pink-50 transition touch-manipulation"
                    title="Thu gọn / mở rộng đợt này" aria-label="Thu gọn hoặc mở rộng đợt này"><i class="fas fa-chevron-up text-xs transition-transform"></i></button>
                ${removeBtn}
            </div>`;
        const meta = `
            <div class="flex items-center justify-between gap-2 mb-3">
                <select class="attempt-kind min-w-0 text-xs font-semibold text-gray-600 bg-gray-50 border border-pink-100 rounded-lg pl-2 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-200 cursor-pointer" aria-label="Cách tính điểm của lần thi này"
                    title="Đổi cách tính điểm riêng cho lần thi này">
                    <optgroup label="Trắc nghiệm">
                        ${opt('ratio:ump', 'Câu đúng · UMP')}
                        ${opt('ratio:linear', 'Câu đúng · %×10')}
                    </optgroup>
                    <optgroup label="Nhập điểm">
                        ${opt('score', 'Điểm hệ 10')}
                        ${opt('gpa4', 'Điểm chữ · hệ 4')}
                    </optgroup>
                </select>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Trọng số</span>
                    <input type="number" inputmode="numeric" class="attempt-weight w-14 px-1.5 py-1 border border-pink-200 rounded-lg text-center text-sm font-bold text-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" max="100" value="${row.weight}" aria-label="Trọng số (%)">
                    <span class="text-xs font-bold text-pink-400">%</span>
                </div>
            </div>`;

        let body;
        // (meta = ô "cách tính điểm" + trọng số, nằm trong phần thân thu gọn được)
        if (row.kind === 'gpa4') {
            const letters = Object.keys(LETTER_MIN10)
                .map(l => `<option value="${l}">${l} · hệ 4 ${calculateGPAFromPercent(LETTER_MIN10[l] * 10).score4.toFixed(1)} · ≥ ${LETTER_MIN10[l].toFixed(1)}đ</option>`)
                .join('');
            body = `
                <select class="attempt-gpa4 w-full px-3 py-2 border border-pink-200 rounded-xl font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-200 cursor-pointer" aria-label="Điểm chữ đạt được">
                    <option value="">— Chưa có điểm —</option>${letters}
                </select>
                <p class="text-[11px] text-gray-400 mt-1.5"><i class="fas fa-circle-info mr-1"></i>Điểm chữ được quy về mốc hệ 10 thấp nhất của mức đó (vd B = 7.0đ) — ước tính thận trọng.</p>`;
        } else if (row.kind === 'score') {
            body = `
                <div class="flex items-center gap-3">
                    <input type="number" inputmode="decimal" class="attempt-score w-24 px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" max="10" step="0.01" placeholder="… /10">
                    <input type="range" class="attempt-slider flex-1 accent-pink-500 cursor-pointer" min="0" max="10" step="0.1" value="0">
                </div>
                <p class="text-[11px] text-gray-400 mt-1.5"><i class="fas fa-circle-info mr-1"></i>Nhập thẳng điểm hệ 10 của lần thi này, hoặc kéo thanh trượt.</p>`;
        } else {
            body = `
                <div class="flex items-end gap-2 mb-2">
                    <div class="flex-1">
                        <label class="block text-[11px] font-semibold text-gray-500 mb-1">Câu đúng</label>
                        <input type="number" inputmode="numeric" class="attempt-correct w-full px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="0" placeholder="—">
                    </div>
                    <span class="text-gray-300 font-bold pb-2">/</span>
                    <div class="flex-1">
                        <label class="block text-[11px] font-semibold text-gray-500 mb-1">Tổng câu</label>
                        <input type="number" inputmode="numeric" class="attempt-total w-full px-3 py-2 border border-pink-200 rounded-xl text-center font-semibold focus:outline-none focus:ring-2 focus:ring-pink-200" min="1" placeholder="—">
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1 mb-2.5"><span class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mr-0.5">Tổng câu</span>${totalChips}</div>
                <input type="range" class="attempt-slider w-full accent-pink-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50" min="0" max="100" step="1" value="0" disabled>
                <p class="attempt-hint text-[11px] text-gray-400 mt-1.5"><i class="fas fa-circle-info mr-1"></i>Nhập tổng câu để kéo thanh chọn nhanh số câu đúng.</p>`;
        }

        return `
            <div class="attempt-row bg-white border border-pink-100 rounded-2xl p-3.5 shadow-sm transition hover:shadow-md"
                data-kind="${row.kind}" data-scale="${row.scale === 'linear' ? 'linear' : 'ump'}" data-label="${safeLabel}" data-index="${idx}">
                ${header}
                <div class="attempt-body mt-2">${meta}${body}</div>
            </div>`;
    }).join('');

    const totalWeight = rows.reduce((a, r) => a + (parseFloat(r.weight) || 0), 0);
    const addBtnHtml = rows.length < MAX_ATTEMPTS
        ? `<button type="button" id="add-attempt-btn" class="w-full mt-3 py-2.5 border-2 border-dashed border-pink-200 rounded-2xl text-sm font-bold text-pink-400 hover:text-pink-500 hover:border-pink-300 hover:bg-pink-50/50 transition flex items-center justify-center gap-1.5"><i class="fas fa-plus"></i> Thêm lần thi</button>`
        : '';
    tableContainer.innerHTML = `
        <div class="space-y-3">${cardsHtml}</div>
        ${addBtnHtml}
        <div id="attempts-weight-bar" class="mt-3"></div>
        <div id="attempts-weight-note" class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs ${Math.round(totalWeight) === 100 ? 'text-gray-400' : 'text-red-500'} mt-2">
            ${rows.length > 1 ? '<button type="button" id="toggle-collapse-all-btn" class="text-gray-400 font-bold hover:text-pink-500 underline decoration-dotted underline-offset-2" title="Thu gọn hoặc mở lại tất cả các đợt">thu gọn / mở tất cả</button>' : ''}
            <button type="button" id="reset-structure-btn" class="text-gray-400 font-bold hover:text-pink-500 underline decoration-dotted underline-offset-2" title="Khôi phục cấu trúc mặc định của loại kỳ thi này">về mặc định</button>
            <button type="button" id="balance-weights-btn" class="text-pink-500 font-bold hover:text-pink-600 underline decoration-dotted underline-offset-2" title="Chia đều trọng số cho các lần thi">chia đều %</button>
            <span>Tổng trọng số: <b id="attempts-weight-sum">${Math.round(totalWeight * 100) / 100}</b>%</span>
        </div>`;

    renderWeightBar(rows);
    wireAttemptInputs();
    updateGpaProjection();
}

/**
 * Gắn sự kiện đồng bộ ô nhập ↔ thanh trượt và cập nhật điểm tổng kết tạm tính theo thời gian thực.
 */
function wireAttemptInputs() {
    const container = document.getElementById('attempts-table');
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('.attempt-row'));

    // Bàn phím ảo trên điện thoại che mất thanh tóm tắt dính đáy -> mờ đi trong lúc gõ.
    // Gắn một lần trên container (container không bị thay, chỉ innerHTML đổi).
    if (!container.dataset.kbWired) {
        const bar = () => document.getElementById('gpa-sticky-bar');
        const setTyping = (on) => bar()?.classList.toggle('opacity-0', on);
        container.addEventListener('focusin', (e) => {
            if (e.target.matches('input[type="number"], input[type="text"]')) setTyping(true);
        });
        // Nhảy giữa các ô cũng bắn focusout -> đợi một nhịp rồi mới hiện lại
        container.addEventListener('focusout', () => setTimeout(() => {
            if (!container.contains(document.activeElement)) setTyping(false);
        }, 120));
        container.dataset.kbWired = 'true';
    }

    rows.forEach(row => {
        const slider = row.querySelector('.attempt-slider');
        if (row.dataset.kind === 'gpa4') {
            row.querySelector('.attempt-gpa4')?.addEventListener('change', () => updateGpaProjection());
            row.querySelector('.attempt-gpa4')?.addEventListener('input', () => updateGpaProjection());
        } else if (row.dataset.kind === 'score') {
            const score = row.querySelector('.attempt-score');
            score?.addEventListener('input', () => {
                let v = parseFloat(score.value);
                if (!isNaN(v)) {
                    if (v > 10) { v = 10; score.value = '10'; } // chặn nhập quá thang 10
                    if (v < 0) { v = 0; score.value = '0'; }
                    if (slider) slider.value = v;
                }
                updateGpaProjection();
            });
            slider?.addEventListener('input', () => {
                if (score) score.value = slider.value;
                updateGpaProjection();
            });
        } else {
            const correct = row.querySelector('.attempt-correct');
            const total = row.querySelector('.attempt-total');
            const hint = row.querySelector('.attempt-hint');
            const syncRange = () => {
                const t = parseInt(total.value, 10);
                if (!slider) return;
                if (!isNaN(t) && t > 0) {
                    slider.max = t;
                    slider.disabled = false;
                    if (hint) hint.classList.add('hidden');
                } else {
                    slider.disabled = true;
                    slider.value = 0;
                    if (hint) hint.classList.remove('hidden');
                }
            };
            const clampCorrect = () => {
                const t = parseInt(total.value, 10);
                let c = parseInt(correct.value, 10);
                if (!isNaN(t) && !isNaN(c) && c > t) { correct.value = t; c = t; }
                if (slider && correct.value !== '') slider.value = correct.value;
            };
            total?.addEventListener('input', () => { syncRange(); clampCorrect(); updateGpaProjection(); });
            correct?.addEventListener('input', () => { clampCorrect(); updateGpaProjection(); });
            slider?.addEventListener('input', () => {
                if (correct) correct.value = slider.value;
                updateGpaProjection();
            });
            // Chip điền nhanh tổng số câu của riêng lần thi này
            row.querySelectorAll('.attempt-total-chip').forEach(btn => btn.addEventListener('click', () => {
                total.value = btn.dataset.total;
                total.dispatchEvent(new Event('input'));
                if (correct && correct.value.trim() === '') { correct.focus(); correct.select?.(); }
            }));
            syncRange();
        }
    });

    // Enter: nhảy sang ô nhập kế tiếp; ở ô cuối cùng thì tính luôn
    const navInputs = Array.from(container.querySelectorAll('input[type="number"]'));
    navInputs.forEach((inp, i) => {
        inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const next = navInputs[i + 1];
            if (next) { next.focus(); next.select?.(); }
            else { inp.blur(); calculateRequiredCorrectAnswers(); }
        });
    });

    // Sửa cấu trúc lần thi — nay dùng được cho MỌI loại kỳ thi
    const cfg = currentRows();
    const weightInputs = Array.from(container.querySelectorAll('.attempt-weight'));
    const note = document.getElementById('attempts-weight-note');
    const sumEl = document.getElementById('attempts-weight-sum');
    const updateSum = () => {
        const sum = weightInputs.reduce((a, el) => a + (parseFloat(el.value) || 0), 0);
        renderWeightBar(cfg);
        if (sumEl) sumEl.textContent = Math.round(sum * 100) / 100;
        if (note) {
            note.classList.toggle('text-red-500', Math.round(sum) !== 100);
            note.classList.toggle('text-gray-400', Math.round(sum) === 100);
        }
        updateGpaProjection();
    };
    weightInputs.forEach((el, i) => el.addEventListener('input', () => {
        if (cfg[i]) cfg[i].weight = parseFloat(el.value) || 0;
        const badge = rows[i]?.querySelector('.attempt-weight-badge');
        if (badge) badge.textContent = `${parseFloat(el.value) || 0}%`;
        updateSum();
    }));

    // Đổi cấu trúc (cách tính điểm/xoá) phải giữ lại giá trị đang nhập: capture -> render -> apply
    const rebuild = (mutate, vals) => {
        mutate();
        renderAttemptsTable();
        applyAttemptValues(vals);
        updateGpaProjection();
        scheduleSaveGoalState();
    };

    rows.forEach((rowEl, i) => {
        // Thu gọn thẻ cho đỡ phải cuộn (nhất là trên điện thoại)
        rowEl.querySelector('.attempt-collapse')?.addEventListener('click', () => {
            setRowCollapsed(rowEl, !rowEl.classList.contains('is-collapsed'));
        });
        // Tên lần thi: sửa tại chỗ, không cần vẽ lại bảng
        rowEl.querySelector('.attempt-label')?.addEventListener('input', (e) => {
            const name = e.target.value.trim() || `Lần ${i + 1}`;
            if (cfg[i]) cfg[i].label = name;
            rowEl.dataset.label = name;
            renderWeightBar(cfg); // tên hiện luôn trên thanh trọng số
            scheduleSaveGoalState();
            scheduleAutoRequired();
        });
        // Cách tính điểm của riêng lần này. Đổi thang trong cùng kiểu "câu đúng" thì giữ số liệu
        // (đây chính là chỗ quy đổi qua lại); đổi hẳn kiểu nhập thì phải bỏ trống vì ô nhập khác loại.
        rowEl.querySelector('.attempt-kind')?.addEventListener('change', (e) => {
            const [kind, scale] = e.target.value.split(':');
            const vals = captureAttemptValues();
            if (rowEl.dataset.kind !== kind) vals[i] = { score: '', correct: '', total: '', gpa4: '' };
            rebuild(() => {
                if (!cfg[i]) return;
                cfg[i].kind = kind;
                if (scale) cfg[i].scale = scale;
            }, vals);
        });
        // Xoá lần thi
        rowEl.querySelector('.attempt-remove')?.addEventListener('click', () => {
            const vals = captureAttemptValues();
            vals.splice(i, 1);
            rebuild(() => cfg.splice(i, 1), vals);
        });
    });

    // Thêm lần thi mới: trọng số mặc định = phần còn thiếu cho đủ 100%
    document.getElementById('add-attempt-btn')?.addEventListener('click', () => {
        const vals = captureAttemptValues();
        const sum = cfg.reduce((a, r) => a + (parseFloat(r.weight) || 0), 0);
        rebuild(() => cfg.push({
            label: `Lần ${cfg.length + 1}`,
            kind: 'ratio',
            scale: getScaleMode(),
            weight: Math.max(0, Math.min(100, Math.round(100 - sum))),
        }), vals);
        // Đưa con trỏ vào ô tên của lần vừa thêm cho tiện đặt tên
        const rowEls = document.querySelectorAll('#attempts-table .attempt-row');
        rowEls[rowEls.length - 1]?.querySelector('.attempt-label')?.select();
    });

    // Thu gọn / mở tất cả các đợt cùng lúc
    document.getElementById('toggle-collapse-all-btn')?.addEventListener('click', () => {
        const anyOpen = rows.some(r => !r.classList.contains('is-collapsed'));
        rows.forEach(r => setRowCollapsed(r, anyOpen));
    });

    // Chia đều trọng số (phần dư dồn vào lần cuối)
    document.getElementById('balance-weights-btn')?.addEventListener('click', () => {
        const vals = captureAttemptValues();
        const n = cfg.length;
        const base = Math.floor(100 / n);
        rebuild(() => cfg.forEach((r, i) => { r.weight = i === n - 1 ? 100 - base * (n - 1) : base; }), vals);
    });

    // Khôi phục cấu trúc mặc định của loại kỳ thi đang chọn (giữ nguyên số liệu đã nhập nếu khớp vị trí)
    document.getElementById('reset-structure-btn')?.addEventListener('click', () => {
        const vals = captureAttemptValues();
        rebuild(() => { examRows[currentExamType()] = defaultRowsOf(currentExamType()); }, vals);
        showToast('Đã trả cấu trúc kỳ thi về mặc định 🔄', 'success');
    });
}

// Confetti mini khi điểm tạm tính vừa chạm mục tiêu (không dùng thư viện).
// ponytail: chỉ bắn khi chuyển trạng thái chưa đạt -> đạt, không bắn lại mỗi lần gõ.
let projReachedBefore = false;
function burstConfetti(host) {
    if (!host || !('animate' in Element.prototype)) return;
    const EMOJI = ['🎉', '✨', '🌸', '💖', '⭐'];
    for (let i = 0; i < 18; i++) {
        const s = document.createElement('span');
        s.textContent = EMOJI[i % EMOJI.length];
        s.style.cssText = 'position:absolute;left:50%;top:40%;font-size:14px;pointer-events:none;z-index:10;';
        host.appendChild(s);
        s.animate([
            { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 1 },
            { transform: `translate(${(Math.random() - 0.5) * 280}px, ${(Math.random() - 0.9) * 200}px) scale(${0.9 + Math.random()}) rotate(${(Math.random() - 0.5) * 240}deg)`, opacity: 0 }
        ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.3,1)' }).onfinish = () => s.remove();
    }
}

/**
 * Thanh tóm tắt dính đáy màn hình (mobile). `data = null` -> ẩn đi.
 * Chỉ đổi textContent/class nên gọi liên tục lúc gõ vẫn nhẹ.
 */
function setStickyBar(data) {
    const bar = document.getElementById('gpa-sticky-bar');
    if (!bar) return;
    if (!data) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const s = document.getElementById('gpa-sticky-score');
    const g = document.getElementById('gpa-sticky-gap');
    if (s) {
        s.textContent = data.score4.toFixed(1);
        s.className = `text-xl font-extrabold leading-none shrink-0 ${data.reached ? 'text-emerald-600' : 'text-pink-500'}`;
    }
    if (g) {
        g.textContent = data.reached
            ? 'Đã chạm mục tiêu 🎉'
            : `${data.score10.toFixed(2)}/10 · thiếu ${data.gap.toFixed(2)}đ`;
        g.className = `text-[11px] font-semibold leading-tight text-left min-w-0 ${data.reached ? 'text-emerald-600' : 'text-gray-500'}`;
    }
}

/**
 * Cập nhật bảng "Điểm tổng kết tạm tính" theo thời gian thực khi người dùng nhập / kéo thanh trượt.
 * Các lần chưa nhập được tạm tính = 0 điểm; có thanh tiến độ và mốc mục tiêu để dễ hình dung.
 */
function updateGpaProjection() {
    // Mọi thay đổi số liệu đều đi qua đây -> tiện thể lưu nháp + tính lại kết quả (đều debounce + có guard)
    scheduleSaveGoalState();
    scheduleAutoRequired();

    const panel = document.getElementById('gpa-live-projection');
    if (!panel) return;
    const rows = Array.from(document.querySelectorAll('#attempts-table .attempt-row'));
    if (rows.length === 0) { panel.classList.add('hidden'); setStickyBar(null); return; }

    const PILL_BASE = 'attempt-live text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0';
    const SCALE_NAMES = { ump: 'công thức UMP', linear: '% đúng × 10' };

    let totalPct = 0, blanks = 0, anyEntered = false;
    for (const el of rows) {
        const r = readAttemptRow(el);
        const weight = r.weight;
        const p = r.p;

        // Pill điểm hệ 10 ngay trên thẻ từng lần thi
        const pill = el.querySelector('.attempt-live');
        if (pill) {
            if (p === null) {
                pill.textContent = 'Chưa thi';
                pill.className = `${PILL_BASE} bg-gray-100 text-gray-400`;
                pill.removeAttribute('title');
            } else {
                const s10 = p * 10;
                const { score4, letterGrade } = calculateGPAFromPercent(s10 * 10);
                const cls = s10 >= 8.5 ? 'bg-amber-100 text-amber-600'
                    : s10 >= 7.0 ? 'bg-emerald-100 text-emerald-600'
                    : s10 >= 5.5 ? 'bg-sky-100 text-sky-600'
                    : s10 >= 4.0 ? 'bg-violet-100 text-violet-600'
                    : 'bg-red-100 text-red-500';
                pill.textContent = `${score4.toFixed(1)} · ${s10.toFixed(2)} · ${letterGrade}`;
                pill.className = `${PILL_BASE} ${cls}`;
                pill.title = `Hệ 4: ${score4.toFixed(1)} · Hệ 10: ${s10.toFixed(2)} · Điểm chữ: ${letterGrade}`
                    + `\nĐóng góp vào điểm tổng kết: +${(p * weight / 10).toFixed(2)}đ (trọng số ${weight}%)`
                    + (r.kind === 'ratio' ? `\nThang quy đổi: ${SCALE_NAMES[r.scale]}` : '');
            }
        }

        if (p === null) blanks++; else { anyEntered = true; totalPct += p * weight; }
    }

    if (!anyEntered) { panel.classList.add('hidden'); setStickyBar(null); return; }

    const score10 = totalPct / 10;
    const { score4, letterGrade } = calculateGPAFromPercent(totalPct);
    const target = getTarget();
    const targetScore10 = target.score10;
    const reached = score10 >= targetScore10 - 1e-9;
    const fillPct = Math.max(0, Math.min(100, score10 * 10));
    const targetPct = Math.max(0, Math.min(100, targetScore10 * 10));
    const accent = reached ? 'text-emerald-600' : 'text-pink-500';
    setStickyBar({ score4, score10, reached, gap: Math.max(0, targetScore10 - score10) });

    const blankNote = blanks > 0
        ? `<span class="text-[11px] text-gray-400">${blanks} lần chưa nhập = 0đ</span>`
        : '';

    panel.className = 'relative mt-1 mb-5 p-4 rounded-2xl border ' + (reached ? 'bg-emerald-50 border-emerald-200' : 'bg-pink-50/70 border-pink-200');
    panel.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><i class="fas fa-gauge-high text-pink-400"></i> Điểm tổng kết tạm tính</span>
            ${blankNote}
        </div>
        <div class="flex items-end gap-4 mb-3 flex-wrap">
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">HỆ 4</span><span class="text-4xl font-extrabold leading-none ${accent} drop-shadow-sm">${score4.toFixed(1)}</span></div>
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">HỆ 10</span><span class="text-xl font-extrabold text-gray-600">${score10.toFixed(2)}</span></div>
            <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-semibold">ĐIỂM CHỮ</span><span class="text-xl font-extrabold text-gray-600">${letterGrade}</span></div>
            <div class="ml-auto text-right"><span class="text-[10px] text-gray-400 font-semibold block">MỤC TIÊU</span><span class="text-sm font-bold ${reached ? 'text-emerald-600' : 'text-amber-600'}">${reached ? 'Đã đạt 🎉' : (target.mode === 'score10' ? targetScore10.toFixed(2) + ' hệ 10' : 'GPA ' + target.gpa4.toFixed(1))}</span></div>
            <div class="w-full text-[11px] text-gray-400">Còn thiếu <b class="${reached ? 'text-emerald-600' : 'text-amber-600'}">${Math.max(0, targetScore10 - score10).toFixed(2)}</b> điểm hệ 10 để chạm mục tiêu</div>
        </div>
        <div class="relative w-full h-3 bg-white rounded-full overflow-hidden shadow-inner">
            <div class="h-full rounded-full transition-all duration-300 ${reached ? 'bg-emerald-400' : 'bg-pink-400'}" style="width:${fillPct}%"></div>
            <div class="absolute top-0 bottom-0 w-0.5 bg-amber-500" style="left:${targetPct}%"></div>
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>0</span>
            <span class="text-amber-500 font-semibold">▲ mốc cần đạt ${targetScore10.toFixed(1)}</span>
            <span>10</span>
        </div>`;
    panel.classList.remove('hidden');

    // Vừa chạm mục tiêu -> ăn mừng một phát 🎉
    if (reached && !projReachedBefore) burstConfetti(panel);
    projReachedBefore = reached;
}

/**
 * Khởi tạo và thiết lập các Event Listeners cho GPA Calculator
 */
export function initGpaCalculator() {
    const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
    if (calculateGpaBtn && !calculateGpaBtn.dataset.listenerAdded) {
        calculateGpaBtn.addEventListener('click', () => calculateGPA());
        calculateGpaBtn.dataset.listenerAdded = 'true';
    }

    // Card "Quy đổi điểm nhanh": tự quy đổi khi gõ + Enter ở "Số câu đúng" nhảy xuống "Tổng số câu"
    const correctEl = document.getElementById('correct-answers');
    const totalEl = document.getElementById('total-questions');
    if (correctEl && totalEl && !correctEl.dataset.autoAdded) {
        let debounce;
        const autoCalc = () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => calculateGPA({ silent: true }), 250);
        };
        correctEl.addEventListener('input', autoCalc);
        totalEl.addEventListener('input', autoCalc);
        correctEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); totalEl.focus(); totalEl.select(); }
        });
        totalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); calculateGPA(); totalEl.blur(); }
        });
        correctEl.dataset.autoAdded = 'true';
    }

    // Chip điền nhanh tổng số câu (30/40/50/60/100) — bắn 'input' để auto quy đổi
    const quickChips = document.getElementById('total-quick-chips');
    if (quickChips && totalEl && !quickChips.dataset.listenerAdded) {
        quickChips.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-total]');
            if (!btn) return;
            totalEl.value = btn.dataset.total;
            totalEl.dispatchEvent(new Event('input'));
            if (correctEl && correctEl.value.trim() === '') { correctEl.focus(); correctEl.select?.(); }
        });
        quickChips.dataset.listenerAdded = 'true';
    }

    // Chips chọn mục tiêu GPA (thay cho dropdown cũ, #desired-gpa-4 giờ là input ẩn)
    const desiredInput = document.getElementById('desired-gpa-4');
    const gpaChipsWrap = document.getElementById('desired-gpa-chips');
    const styleGpaChips = () => {
        if (!gpaChipsWrap || !desiredInput) return;
        gpaChipsWrap.querySelectorAll('.gpa-chip').forEach(btn => {
            const active = btn.dataset.gpa === desiredInput.value;
            btn.classList.toggle('bg-gradient-to-br', active);
            btn.classList.toggle('from-[#FF69B4]', active);
            btn.classList.toggle('to-[#FF8DC7]', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('border-transparent', active);
            btn.classList.toggle('shadow-md', active);
            btn.classList.toggle('shadow-pink-200', active);
            btn.classList.toggle('bg-white', !active);
            btn.classList.toggle('text-gray-600', !active);
            btn.classList.toggle('border-pink-100', !active);
        });
    };
    if (gpaChipsWrap && desiredInput && !gpaChipsWrap.dataset.listenerAdded) {
        gpaChipsWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-gpa]');
            if (!btn) return;
            desiredInput.value = btn.dataset.gpa;
            styleGpaChips();
            syncTargetHint();
            updateGpaProjection();
        });
        gpaChipsWrap.dataset.listenerAdded = 'true';
    }

    // Mục tiêu theo hệ 4 (chips điểm chữ) hay hệ 10 (ô nhập + thanh trượt) — chuyển đổi qua lại
    const targetToggle = document.getElementById('target-mode-toggle');
    const score10Input = document.getElementById('desired-score-10');
    const score10Range = document.getElementById('desired-score-10-range');
    const score10Wrap = document.getElementById('desired-10-wrap');
    const targetHint = document.getElementById('desired-target-hint');
    const syncTargetHint = () => {
        const mode = getTargetMode();
        // đặt thẳng display: chips là .grid nên class 'hidden' dễ bị đè
        if (gpaChipsWrap) gpaChipsWrap.style.display = mode === 'gpa4' ? '' : 'none';
        score10Wrap?.classList.toggle('hidden', mode !== 'score10');
        targetToggle?.querySelectorAll('.target-mode-btn').forEach(btn => {
            const active = btn.dataset.targetMode === mode;
            btn.classList.toggle('bg-[#FF69B4]', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('shadow-sm', active);
            btn.classList.toggle('text-gray-500', !active);
        });
        if (targetHint) {
            const t = getTarget();
            targetHint.innerHTML = t.mode === 'score10'
                ? `≈ hệ 4 <b class="text-pink-500">${t.gpa4.toFixed(1)}</b> · điểm chữ <b class="text-pink-500">${t.letter}</b>`
                : `≈ cần <b class="text-pink-500">${t.score10.toFixed(1)}</b> điểm hệ 10 trở lên`;
        }
    };
    if (targetToggle && !targetToggle.dataset.listenerAdded) {
        targetToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-target-mode]');
            if (!btn || btn.dataset.targetMode === getTargetMode()) return;
            // Chuyển hệ nào thì mang theo mục tiêu hiện tại sang hệ đó cho khỏi mất công đặt lại
            const cur = getTarget();
            try { localStorage.setItem(TARGET_MODE_KEY, btn.dataset.targetMode); } catch (err) { /* bỏ qua */ }
            if (btn.dataset.targetMode === 'score10') {
                if (score10Input) score10Input.value = cur.score10.toFixed(1);
                if (score10Range) score10Range.value = cur.score10.toFixed(1);
            } else if (desiredInput) {
                desiredInput.value = cur.gpa4.toFixed(1);
                styleGpaChips();
            }
            syncTargetHint();
            updateGpaProjection();
        });
        targetToggle.dataset.listenerAdded = 'true';
    }
    if (score10Input && score10Range && !score10Input.dataset.listenerAdded) {
        const syncScore10 = (src, dst) => {
            let v = parseFloat(src.value);
            if (isNaN(v)) return;
            v = Math.max(0, Math.min(10, v));
            src.value = v;
            dst.value = v;
            syncTargetHint();
            updateGpaProjection();
        };
        score10Input.addEventListener('input', () => syncScore10(score10Input, score10Range));
        score10Range.addEventListener('input', () => syncScore10(score10Range, score10Input));
        score10Input.dataset.listenerAdded = 'true';
    }

    // Toggle "Thang điểm mặc định": áp dụng công thức UMP <-> % đúng × 10 cho TẤT CẢ lần thi trắc nghiệm
    const scaleToggle = document.getElementById('scale-mode-toggle');
    const styleScaleToggle = () => {
        if (!scaleToggle) return;
        const mode = getScaleMode();
        scaleToggle.querySelectorAll('.scale-mode-btn').forEach(btn => {
            const active = btn.dataset.mode === mode;
            btn.classList.toggle('bg-[#FF69B4]', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('shadow-sm', active);
            btn.classList.toggle('text-gray-500', !active);
        });
    };
    if (scaleToggle && !scaleToggle.dataset.listenerAdded) {
        scaleToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-mode]');
            if (!btn || btn.dataset.mode === getScaleMode()) return;
            try { localStorage.setItem(SCALE_MODE_KEY, btn.dataset.mode); } catch (err) { /* bỏ qua */ }
            styleScaleToggle();
            // Áp cho mọi lần thi đang có (số liệu giữ nguyên, chỉ đổi cách quy đổi)
            const vals = captureAttemptValues();
            currentRows().forEach(r => { if (r.kind === 'ratio') r.scale = btn.dataset.mode; });
            renderAttemptsTable();
            applyAttemptValues(vals);
            scheduleSaveGoalState();
            updateGpaProjection();
        });
        scaleToggle.dataset.listenerAdded = 'true';
    }

    // Nút xoá nhanh dữ liệu đã nhập (giữ nguyên loại kỳ thi & mục tiêu)
    const resetGoalBtn = document.getElementById('reset-goal-btn');
    if (resetGoalBtn && !resetGoalBtn.dataset.listenerAdded) {
        resetGoalBtn.addEventListener('click', () => {
            requiredCalcDone = false; // tắt tự tính lại trước khi dọn bảng
            renderAttemptsTable(); // vẽ lại bảng trống theo cấu hình hiện tại
            const resultArea = document.getElementById('required-correct-result');
            if (resultArea) resultArea.innerHTML = '';
            scheduleSaveGoalState();
            showToast('Đã xoá dữ liệu các lần thi 🧹', 'success');
        });
        resetGoalBtn.dataset.listenerAdded = 'true';
    }

    const examTypeEl = document.getElementById('exam-type');
    if (examTypeEl && !examTypeEl.dataset.listenerAdded) {
        examTypeEl.addEventListener('change', () => { renderAttemptsTable(); scheduleSaveGoalState(); });
        examTypeEl.dataset.listenerAdded = 'true';
    }

    const calcRequiredBtn = document.getElementById('calculate-required-btn');
    if (calcRequiredBtn && !calcRequiredBtn.dataset.listenerAdded) {
        calcRequiredBtn.addEventListener('click', () => calculateRequiredCorrectAnswers());
        calcRequiredBtn.dataset.listenerAdded = 'true';
    }

    // Thanh dính đáy (mobile): bấm là tính luôn rồi nhảy xuống kết quả
    const stickyBtn = document.getElementById('gpa-sticky-btn');
    if (stickyBtn && !stickyBtn.dataset.listenerAdded) {
        stickyBtn.addEventListener('click', () => calculateRequiredCorrectAnswers());
        stickyBtn.dataset.listenerAdded = 'true';
    }

    // Sao chép kết quả dạng chữ (dán vào Zalo/Messenger cho bạn bè xem)
    const resultArea = document.getElementById('required-correct-result');
    if (resultArea && !resultArea.dataset.copyWired) {
        resultArea.addEventListener('click', (e) => {
            if (!e.target.closest('#copy-required-btn')) return;
            const card = resultArea.querySelector('.result-card');
            const text = (card?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
            navigator.clipboard?.writeText(text)
                .then(() => showToast('Đã sao chép kết quả 📋', 'success'))
                .catch(() => showToast('Trình duyệt không cho sao chép 😢', 'warning'));
        });
        resultArea.dataset.copyWired = 'true';
    }

    // Chọn / thêm / đổi tên / xoá môn học
    syncTargetUI = () => { styleGpaChips(); syncTargetHint(); };
    const subjectChips = document.getElementById('subject-chips');
    if (subjectChips && !subjectChips.dataset.listenerAdded) {
        subjectChips.addEventListener('click', (e) => {
            if (e.target.closest('#add-subject-btn')) { addSubject(); return; }
            const chip = e.target.closest('.subject-chip');
            if (chip && chip.dataset.name !== loadSubjects().active) switchSubject(chip.dataset.name);
        });
        document.getElementById('rename-subject-btn')?.addEventListener('click', renameSubject);
        document.getElementById('delete-subject-btn')?.addEventListener('click', deleteSubject);
        subjectChips.dataset.listenerAdded = 'true';
    }

    // Ô số tín chỉ trong bảng GPA học kỳ — chỉ cập nhật phần đầu để không mất con trỏ khi gõ
    const semesterBody = document.getElementById('semester-gpa-body');
    if (semesterBody && !semesterBody.dataset.listenerAdded) {
        semesterBody.addEventListener('input', (e) => {
            const inp = e.target.closest('.semester-credit');
            if (!inp) return;
            subjectCredits()[inp.dataset.name] = Math.max(0, parseFloat(inp.value) || 0);
            saveSubjects();
            renderSemesterGpa(true);
        });
        semesterBody.dataset.listenerAdded = 'true';
    }
    renderSubjectChips();

    // Chỉ dựng bảng + khôi phục dữ liệu MỘT lần; các lần mở tab sau giữ nguyên những gì đang nhập
    const tableContainer = document.getElementById('attempts-table');
    if (tableContainer && !tableContainer.dataset.ready) {
        restoreGoalState();
        tableContainer.dataset.ready = 'true';
    }
    styleGpaChips();
    styleScaleToggle();
    syncTargetHint();
}

/**
 * Khôi phục dữ liệu card "số câu cần đạt" đã lưu trên máy (loại kỳ thi, mục tiêu,
 * số liệu từng lần thi), sau đó mới bật cơ chế tự lưu để không ghi đè dữ liệu cũ.
 */
function restoreGoalState() {
    const st = loadGoalState();
    const examTypeEl = document.getElementById('exam-type');
    const desiredInput = document.getElementById('desired-gpa-4');

    if (st) {
        if (st.examType && examTypeEl && [...examTypeEl.options].some(o => o.value === st.examType)) examTypeEl.value = st.examType;
        if (st.desired && desiredInput) desiredInput.value = st.desired;
        const s10 = document.getElementById('desired-score-10');
        const s10r = document.getElementById('desired-score-10-range');
        if (st.targetScore10 && s10) { s10.value = st.targetScore10; if (s10r) s10r.value = st.targetScore10; }
        // Cấu trúc các lần thi đã lưu (tên, cách tính điểm, thang, trọng số) — áp cho loại kỳ thi tương ứng
        if (Array.isArray(st.rows) && st.rows.length > 0) {
            examRows[currentExamType()] = st.rows.slice(0, MAX_ATTEMPTS).map((r, i) => ({
                label: (r.label || '').trim() || `Lần ${i + 1}`,
                kind: ['score', 'gpa4', 'ratio'].includes(r.kind) ? r.kind : 'ratio',
                scale: r.scale === 'linear' ? 'linear' : 'ump',
                weight: Math.max(0, Math.min(100, parseFloat(r.weight) || 0)),
            }));
        }
    } else if (examTypeEl) {
        // Môn mới chưa có dữ liệu -> về cấu hình mặc định thay vì giữ của môn trước
        examTypeEl.value = 'pretest';
    }

    renderAttemptsTable();

    if (st && Array.isArray(st.rows)) {
        const rowEls = document.querySelectorAll('#attempts-table .attempt-row');
        rowEls.forEach((el, i) => {
            const r = st.rows[i];
            if (!r) return;
            const setVal = (sel, v) => {
                const inp = el.querySelector(sel);
                if (inp && v != null && v !== '') inp.value = v;
            };
            setVal('.attempt-total', r.total);
            setVal('.attempt-score', r.score);
            setVal('.attempt-correct', r.correct);
            setVal('.attempt-gpa4', r.gpa4);
        });
        // Bắn 'input' để đồng bộ slider / tổng trọng số theo giá trị vừa khôi phục
        rowEls.forEach(el => {
            el.querySelectorAll('.attempt-total, .attempt-correct, .attempt-score, .attempt-gpa4').forEach(inp => {
                if (inp.value !== '') inp.dispatchEvent(new Event('input'));
            });
        });
        // Đợt nào đã có điểm thì thu gọn sẵn — mở app ra là thấy ngay đợt còn phải nhập
        rowEls.forEach(el => { if (readAttemptRow(el).p !== null) setRowCollapsed(el, true); });
    }

    goalStateRestored = true; // từ giờ mới cho phép tự lưu
    updateGpaProjection();
}

