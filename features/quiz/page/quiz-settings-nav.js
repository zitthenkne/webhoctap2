// File: features/quiz/page/quiz-settings-nav.js
// Bảng "Ngựa thì chỉnh" gọn lại (2026-10-21) — người dùng: "nhiều mục quá, nhìn rối, chẳng biết chọn cái gì cho nhu cầu nào".
//  · 4 tab theo nhu cầu: Làm bài · Hiển thị · Âm thanh · Tiện ích (Làm bài / Tiện ích chỉ có khi đang làm bài — .qs-quiz-only).
//  · Gợi ý 1 chạm theo kiểu học (Ôn kỹ / Tự suy trước / Thi thử / Lướt nhanh): KHÔNG giữ logic công tắc nào ở đây —
//    chỉ BẤM HỘ đúng các hàng công tắc có sẵn (mỗi hàng tự lưu + áp dụng như khi người dùng bấm), rồi gom các thông báo lẻ thành một.
//  · Ô tìm thiết lập không dấu: khớp tên + mô tả + title + data-k (từ khóa theo nhu cầu: "đêm", "chói", "nhầm"…), tìm xuyên mọi tab.

const $ = (id) => document.getElementById(id);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const shown = (el) => el.getClientRects().length > 0;

const PRESETS = {
    deep: { name: 'Ôn kỹ', desc: 'Xem đáp án + hướng tư duy ngay sau mỗi câu, đọc trọn giải thích, không tính giờ.',
        set: { 'qs-show-answer': true, 'qs-timed': false, 'qs-auto-next': false, 'qs-reason-marks': true, 'qs-reason-step': false, 'qs-kb-clamp': false } },
    think: { name: 'Tự suy trước', desc: 'Ra đáp án rồi tự đoán từng bước suy luận trước khi mở (phím G).',
        set: { 'qs-show-answer': true, 'qs-timed': false, 'qs-auto-next': false, 'qs-reason-marks': true, 'qs-reason-step': true } },
    exam: { name: 'Thi thử', desc: 'Tính giờ như thi thật, nộp bài mới biết đúng sai, tắt meme.',
        set: { 'qs-timed': true, 'qs-show-answer': false, 'qs-auto-next': false, 'qs-meme': false } },
    fast: { name: 'Lướt nhanh', desc: 'Ôn lại đề đã làm: trả lời đúng tự qua câu, mục dài gập gọn, bỏ hiệu ứng.',
        set: { 'qs-show-answer': true, 'qs-timed': false, 'qs-auto-next': true, 'qs-kb-clamp': true, 'qs-reason-fx': false, 'qs-meme': false } },
};
const HINT = 'Chạm một kiểu: các công tắc bên dưới tự chỉnh theo, vẫn đổi riêng từng cái được.';

const isOn = (id) => $(id)?.getAttribute('aria-checked') === 'true';
function activePreset() {
    return Object.keys(PRESETS).find(k => Object.entries(PRESETS[k].set).every(([id, v]) => !$(id) || isOn(id) === v)) || '';
}
function syncPresets() {
    const act = activePreset();
    document.querySelectorAll('#quiz-settings-popover [data-qs-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qsPreset === act)));
    const d = $('qs-preset-desc');
    if (d) d.textContent = act ? PRESETS[act].desc : HINT;
}
function applyPreset(k) {
    const p = PRESETS[k];
    if (!p) return;
    const box = $('toast-container');
    const before = new Set(box ? box.children : []);
    Object.entries(p.set).forEach(([id, v]) => { const row = $(id); if (row && isOn(id) !== v) row.click(); });
    setTimeout(() => {
        if (box) [...box.children].forEach(t => { if (!before.has(t)) t.remove(); });   // mỗi công tắc một thông báo -> gom lại
        import('../../../core/utils.js').then(u => u.showToast(`Đã chỉnh theo kiểu "${p.name}"`, 'success', 2200));
        syncPresets();
    }, 80);
}

function setTab(name, focus, save) {
    const pop = $('quiz-settings-popover');
    const tabs = [...pop.querySelectorAll('[data-qs-tab]')].filter(shown);
    if (!tabs.some(t => t.dataset.qsTab === name)) name = tabs[0] && tabs[0].dataset.qsTab;
    pop.querySelectorAll('[data-qs-tab]').forEach(t => {
        const sel = t.dataset.qsTab === name;
        t.setAttribute('aria-selected', String(sel));
        t.tabIndex = sel ? 0 : -1;
        if (sel && focus) t.focus();
    });
    pop.querySelectorAll('[data-qs-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.qsPanel === name));
    if (save) lsSet('quiz_qs_tab', name);   // chỉ nhớ khi người dùng tự chọn tab
}

function runSearch(q) {
    const pop = $('quiz-settings-popover');
    // Gõ có dấu thì so CÓ dấu trên chữ hiển thị ("đêm" ≠ "đếm", "giờ" ≠ "giọng"); gõ không dấu thì so không dấu, kèm từ khóa data-k
    const words = String(q || '').normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hit = (w, low, folded) => (w === fold(w) ? folded.includes(w) : low.includes(w));
    pop.classList.toggle('is-searching', words.length > 0);   // đang tìm: hiện mọi tab, chỉ giữ hàng khớp
    let hits = 0;
    pop.querySelectorAll('.qs-panel .qs-group').forEach(g => {
        g.classList.remove('qs-nomatch');   // gỡ ẩn của lần tìm trước rồi mới đo hàng có hiện không
        const gt = String(g.querySelector('.qs-group-title')?.textContent || '').normalize('NFC').toLowerCase();
        const titleHit = words.length && words.every(w => hit(w, gt, fold(gt)));
        let any = false;
        [...g.children].forEach(el => {
            if (el.classList.contains('qs-group-title')) return;
            const low = [el.textContent, el.title, ...[...el.querySelectorAll('[title]')].map(x => x.title)].join(' ').normalize('NFC').toLowerCase();
            const folded = fold(low + ' ' + (el.dataset.k || '') + ' ' + [...el.querySelectorAll('[data-k]')].map(x => x.dataset.k).join(' '));
            const ok = !words.length || titleHit || words.every(w => hit(w, low, folded));
            el.classList.toggle('qs-nomatch', !ok);
            if (ok && words.length && shown(el)) any = true;
        });
        g.classList.toggle('qs-nomatch', words.length > 0 && !any);
        if (any) hits++;
    });
    $('qs-search-empty').hidden = !words.length || hits > 0;
}

export function setupSettingsNav() {
    const pop = $('quiz-settings-popover'), fab = $('quiz-settings-fab'), search = $('qs-search');
    if (!pop || !fab) return;
    pop.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-qs-tab]');
        if (tab) { setTab(tab.dataset.qsTab, false, true); return; }
        const pre = e.target.closest('[data-qs-preset]');
        if (pre) { applyPreset(pre.dataset.qsPreset); return; }
        if (e.target.closest('[role="switch"]')) setTimeout(syncPresets, 0);   // tự bấm từng công tắc: gợi ý đang sáng có còn đúng không
    });
    pop.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = [...pop.querySelectorAll('[data-qs-tab]')].filter(shown);
        const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        if (next) { e.preventDefault(); setTab(next.dataset.qsTab, true, true); }
    });
    if (search) {
        search.addEventListener('input', () => runSearch(search.value));
        search.addEventListener('keydown', (e) => {
            e.stopPropagation();   // gõ chữ để tìm, đừng kích hoạt phím tắt A–D / M / N… của trang làm bài
            if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; runSearch(''); }
        });
    }
    // Mở bảng: về tab lần trước (đang làm bài mà chưa chọn tab nào thì "Làm bài"), xóa ô tìm, đọc lại gợi ý đang khớp
    fab.addEventListener('click', () => requestAnimationFrame(() => {
        if (search && search.value) { search.value = ''; runSearch(''); }
        setTab(lsGet('quiz_qs_tab') || (document.body.classList.contains('quiz-active') ? 'study' : 'view'));
        syncPresets();
    }));
    setTab(lsGet('quiz_qs_tab') || 'view');
}
