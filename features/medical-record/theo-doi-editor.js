// theo-doi-editor.js — nhật ký theo dõi diễn tiến, dùng khi đi buồng.
//
// Mỗi lần thăm bệnh ghi một dòng: ngày giờ, sinh hiệu nhanh, diễn tiến, xử trí.
// Mới nhất nằm trên cùng để mở ra là thấy ngay tình trạng hôm nay.
//
// Lưu ở record.theoDoi = [{ id, dt, m, ha, t, nt, spo2, dienTien, xuTri }]

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trim = (x) => String(x ?? '').trim();
let logs = [];
let host, onChangeCb = () => { };

const isEmpty = (e) => !trim(e.dienTien) && !trim(e.xuTri)
    && !['m', 'ha', 't', 'nt', 'spo2'].some(k => trim(e[k]));

export function getTheoDoi() {
    return sorted().filter(e => !isEmpty(e));
}

export function setTheoDoi(arr) {
    logs = (Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [])
        .map(e => ({ id: e.id || newId(), ...e }));
    render();
}

const newId = () => 'td' + Math.random().toString(36).slice(2, 8);
const sorted = () => logs.slice().sort((a, b) => String(b.dt || '').localeCompare(String(a.dt || '')));

function fmtDt(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? `${m[3]}/${m[2]} · ${m[4]}:${m[5]}` : 'Chưa đặt thời gian';
}

/** Ngày điều trị thứ mấy so với ngày vào viện */
function dayNo(dt) {
    const admit = $('admission-date')?.value;
    if (!admit || !dt) return '';
    const n = Math.round((new Date(String(dt).slice(0, 10)) - new Date(admit)) / 86400000);
    return n >= 0 ? `N${n + 1}` : '';
}

function entryHtml(e, i) {
    const vitals = [['m', 'M', 'l/p'], ['ha', 'HA', 'mmHg'], ['t', 'T°', '°C'],
    ['nt', 'NT', 'l/p'], ['spo2', 'SpO2', '%']];
    return `<div class="td-card" data-i="${i}">
        <div class="td-head">
            <span class="td-day">${esc(dayNo(e.dt) || '•')}</span>
            <input type="datetime-local" class="td-dt" data-k="dt" value="${esc(e.dt || '')}" aria-label="Thời điểm thăm bệnh">
            <span class="td-when">${esc(fmtDt(e.dt))}</span>
            <button type="button" class="td-x" data-act="del" title="Xóa lần theo dõi"><i class="fas fa-trash"></i></button>
        </div>
        <div class="td-vitals">
            ${vitals.map(([k, label, unit]) => `<label><span>${label}</span>
                <input class="td-v" data-k="${k}" value="${esc(e[k] || '')}" placeholder="${unit}" aria-label="${label}"></label>`).join('')}
        </div>
        <textarea class="td-in" data-k="dienTien" rows="2" placeholder="Diễn tiến: bệnh nhân tỉnh, hết sốt, còn ho ít, ăn uống được…">${esc(e.dienTien || '')}</textarea>
        <textarea class="td-in" data-k="xuTri" rows="2" placeholder="Xử trí / thay đổi y lệnh: tiếp tục kháng sinh ngày thứ 3, giảm liều…">${esc(e.xuTri || '')}</textarea>
    </div>`;
}

function render() {
    if (!host) return;
    const view = sorted();
    logs = view;
    host.innerHTML = view.length ? view.map(entryHtml).join('')
        : `<p class="td-empty">Chưa có lần theo dõi nào — bấm “Thêm lần theo dõi” mỗi lần đi buồng, máy tự điền ngày giờ.</p>`;
    host.querySelectorAll('textarea').forEach(autoGrow);
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 44) + 'px';
}

/** Dòng chữ tóm tắt cho trang xem / file xuất */
export function theoDoiToText(list) {
    return (list || []).map(e => {
        const v = [['M', e.m, 'l/p'], ['HA', e.ha, 'mmHg'], ['T°', e.t, '°C'],
        ['NT', e.nt, 'l/p'], ['SpO2', e.spo2, '%']]
            .filter(([, x]) => trim(x)).map(([l, x, u]) => `${l} ${x}${u ? ' ' + u : ''}`).join(', ');
        const head = fmtDt(e.dt).replace(' · ', ' ');
        return [`* ${head}${v ? ' — ' + v : ''}`,
        trim(e.dienTien) && `   Diễn tiến: ${trim(e.dienTien)}`,
        trim(e.xuTri) && `   Xử trí: ${trim(e.xuTri)}`].filter(Boolean).join('\n');
    }).join('\n');
}

export function initTheoDoi(options) {
    onChangeCb = options?.onChange || (() => { });
    host = $('td-list');
    if (!host) return;
    render();

    const onEdit = (e) => {
        const card = e.target.closest('.td-card');
        if (!card || !e.target.dataset.k) return;
        const item = logs[+card.dataset.i];
        if (!item) return;
        item[e.target.dataset.k] = e.target.value;
        if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
        if (e.target.dataset.k === 'dt') {
            // Đổi giờ: chỉ vẽ lại khi thứ tự thật sự đổi, kẻo mất chỗ đang gõ
            const before = logs.map(x => x.id).join();
            const after = sorted().map(x => x.id).join();
            if (before !== after) render();
            else {
                card.querySelector('.td-when').textContent = fmtDt(item.dt);
                card.querySelector('.td-day').textContent = dayNo(item.dt) || '•';
            }
        }
        onChangeCb();
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);

    host.addEventListener('click', (e) => {
        if (!e.target.closest('[data-act="del"]')) return;
        logs.splice(+e.target.closest('.td-card').dataset.i, 1);
        render();
        onChangeCb();
    });

    $('td-add')?.addEventListener('click', () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        // Lần theo dõi mới lấy sẵn sinh hiệu của lần gần nhất để chỉ sửa con số thay đổi
        const last = sorted()[0] || {};
        logs.push({
            id: newId(), dt: now.toISOString().slice(0, 16),
            m: last.m || '', ha: last.ha || '', t: '', nt: last.nt || '', spo2: '',
            dienTien: '', xuTri: ''
        });
        render();
        onChangeCb();
        host.querySelector('.td-card .td-in')?.focus();
    });
}
