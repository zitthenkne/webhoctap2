// bien-luan-editor.js — X. BIỆN LUẬN LÂM SÀNG vẽ dưới dạng cây sơ đồ.
//
// Mỗi vấn đề là một cây: dấu chứng ủng hộ → hướng nghĩ → các nhánh nguyên nhân
// (mỗi nhánh gắn mức "nghĩ nhiều nhất / nghĩ tới / ít nghĩ / loại trừ" kèm lý do)
// → các biến chứng cần bàn. App gợi sẵn nhánh nguyên nhân theo hội chứng thường gặp,
// rồi chuyển cả cây thành đoạn văn biện luận chuyên nghiệp.
//
// Lưu ở record.bienLuan = { vanDe:[{id,ten,lamSang:[],nghiDen,nguyenNhan:[],bienChung:[]}] }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trim = (x) => String(x ?? '').trim();
const newId = () => 'b' + Math.random().toString(36).slice(2, 8);

import { suggestFor, searchLibrary } from './bien-luan-data.js';
import { drawMap, downloadMapPng } from './bien-luan-map.js';

const LEVELS = ['Nghĩ nhiều nhất', 'Nghĩ tới', 'Ít nghĩ', 'Loại trừ'];

let data = { vanDe: [] };
let host, onChangeCb = () => { };

/* ---------- dữ liệu ---------- */
function normalize(v) {
    const out = {
        id: v.id || newId(), ten: v.ten || '',
        lamSang: [], yeuTo: v.yeuTo || '', redFlags: Array.isArray(v.redFlags) ? v.redFlags.filter(Boolean) : [],
        nghiDen: v.nghiDen || '', nguyenNhan: [], bienChung: []
    };
    // Bản cũ lưu chuỗi; tách thành từng nhánh cho vào cây
    if (Array.isArray(v.lamSang)) out.lamSang = v.lamSang.filter(Boolean);
    else if (trim(v.lamSang)) out.lamSang = trim(v.lamSang).split(/[;\n]/).map(trim).filter(Boolean);

    if (Array.isArray(v.nguyenNhan)) {
        out.nguyenNhan = v.nguyenNhan.map(n => ({ id: n.id || newId(), ten: n.ten || '', muc: n.muc || LEVELS[1], lyDo: n.lyDo || '', cls: n.cls || '' }));
    } else if (trim(v.nguyenNhan)) {
        out.nguyenNhan = trim(v.nguyenNhan).split(/[;,\n]/).map(trim).filter(Boolean)
            .map(ten => ({ id: newId(), ten, muc: LEVELS[1], lyDo: '', cls: '' }));
    }
    if (trim(v.loaiTru)) out.nguyenNhan.push({ id: newId(), ten: trim(v.loaiTru), muc: LEVELS[3], lyDo: '', cls: '' });

    if (Array.isArray(v.bienChung)) {
        out.bienChung = v.bienChung.map(b => ({ id: b.id || newId(), ten: b.ten || '', lapLuan: b.lapLuan || '' }));
    }
    return out;
}

export function getBienLuan() {
    return {
        vanDe: data.vanDe
            .map(v => ({
                ...v,
                lamSang: v.lamSang.filter(x => trim(x)),
                nguyenNhan: v.nguyenNhan.filter(n => trim(n.ten)),
                bienChung: v.bienChung.filter(b => trim(b.ten))
            }))
            .filter(v => trim(v.ten) || v.lamSang.length || trim(v.nghiDen) || trim(v.yeuTo)
                || v.redFlags.length || v.nguyenNhan.length || v.bienChung.length)
    };
}

export function setBienLuan(obj) {
    const src = obj && Array.isArray(obj.vanDe) ? obj.vanDe : [];
    // Bảng "phân định" của bản cũ: gắn vào vấn đề đầu tiên cho khỏi mất
    const legacy = (obj?.phanDinh || []).map(p => ({ id: p.id || newId(), ten: p.ten || '', muc: p.muc || LEVELS[1], lyDo: p.lyDo || '' }));
    data = { vanDe: src.map(normalize) };
    if (legacy.length) {
        if (!data.vanDe.length) data.vanDe.push(normalize({ ten: '' }));
        data.vanDe[0].nguyenNhan.push(...legacy.filter(l => trim(l.ten)));
    }
    (obj?.bienChung || []).forEach(b => {
        if (!data.vanDe.length) data.vanDe.push(normalize({ ten: '' }));
        data.vanDe[0].bienChung.push({ id: b.id || newId(), ten: b.ten || '', lapLuan: b.lapLuan || '' });
    });
    render();
}

/** Tạo cây từ mục VIII. Đặt vấn đề */
export function syncFromProblems() {
    const lines = ($('problem-list')?.value || '').split('\n')
        .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return 0;
    let added = 0;
    lines.forEach(ten => {
        if (data.vanDe.some(v => trim(v.ten).toLowerCase() === ten.toLowerCase())) return;
        data.vanDe.push(normalize({ ten }));
        added++;
    });
    if (added) { render(); onChangeCb(); }
    return added;
}

/* ---------- vẽ cây ---------- */
function nguyenNhanHtml(n, vi, ni) {
    const lv = n.muc || LEVELS[1];
    return `<div class="tr-leaf lv-${LEVELS.indexOf(lv)}" data-v="${vi}" data-n="${ni}">
        <span class="tr-dot"></span>
        <input class="tr-in name" data-k="ten" value="${esc(n.ten)}" placeholder="Nguy\u00ean nh\u00e2n / ch\u1ea9n \u0111o\u00e1n" aria-label="Nguy\u00ean nh\u00e2n">
        <select class="tr-lv" data-k="muc" aria-label="M\u1ee9c \u0111\u1ed9 ngh\u0129 t\u1edbi">
            ${LEVELS.map(l => `<option ${lv === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <input class="tr-in" data-k="lyDo" value="${esc(n.lyDo)}" placeholder="v\u00ec\u2026 (d\u1ea5u ch\u1ee9ng \u1ee7ng h\u1ed9 ho\u1eb7c thi\u1ebfu)" aria-label="L\u00fd do">
        <button type="button" class="tr-x" data-act="del-nn" title="X\u00f3a nh\u00e1nh"><i class="fas fa-xmark"></i></button>
        <input class="tr-in sub" data-k="cls" value="${esc(n.cls)}" placeholder="C\u1eadn l\u00e2m s\u00e0ng \u0111\u1ec3 ph\u00e2n \u0111\u1ecbnh nh\u00e1nh n\u00e0y" aria-label="C\u1eadn l\u00e2m s\u00e0ng">
    </div>`;
}

function bienChungHtml(b, vi, bi) {
    return `<div class="tr-leaf lv-warn" data-v="${vi}" data-b="${bi}">
        <span class="tr-dot"></span>
        <input class="tr-in name" data-k="ten" value="${esc(b.ten)}" placeholder="Biến chứng" aria-label="Biến chứng">
        <input class="tr-in wide" data-k="lapLuan" value="${esc(b.lapLuan)}" placeholder="dấu chứng gợi ý, cần làm gì để xác định" aria-label="Lập luận">
        <button type="button" class="tr-x" data-act="del-bc" title="Xóa nhánh"><i class="fas fa-xmark"></i></button>
    </div>`;
}

function vanDeHtml(v, vi) {
    const lib = suggestFor(v.ten);
    const goiY = lib.nn.filter(x => !v.nguyenNhan.some(n => trim(n.ten).toLowerCase() === x.toLowerCase())).slice(0, 8);
    const goiRed = (lib.red || []).filter(x => !v.redFlags.includes(x)).slice(0, 4);
    const goiCls = (lib.cls || []).slice(0, 6);

    return `<div class="tr-card" data-v="${vi}">
        <div class="tr-root">
            <span class="tr-no">${vi + 1}</span>
            <input class="tr-title" data-k="ten" value="${esc(v.ten)}" placeholder="T\u00ean h\u1ed9i ch\u1ee9ng / v\u1ea5n \u0111\u1ec1 (g\u00f5 \u0111\u1ec3 app g\u1ee3i nh\u00e1nh)" aria-label="T\u00ean v\u1ea5n \u0111\u1ec1">
            <span class="tr-tools">
                <button type="button" class="tr-x" data-act="up" title="L\u00ean tr\u00ean"><i class="fas fa-arrow-up"></i></button>
                <button type="button" class="tr-x" data-act="down" title="Xu\u1ed1ng d\u01b0\u1edbi"><i class="fas fa-arrow-down"></i></button>
                <button type="button" class="tr-x" data-act="dup-vd" title="Nh\u00e2n b\u1ea3n"><i class="fas fa-copy"></i></button>
                <button type="button" class="tr-x" data-act="del-vd" title="X\u00f3a v\u1ea5n \u0111\u1ec1"><i class="fas fa-trash"></i></button>
            </span>
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-magnifying-glass"></i> L\u00e2m s\u00e0ng \u1ee7ng h\u1ed9</div>
            <div class="tr-tags">
                ${v.lamSang.map((x, i) => `<span class="tr-tag" data-v="${vi}" data-s="${i}">${esc(x)}
                    <button type="button" data-act="del-ls" aria-label="X\u00f3a d\u1ea5u ch\u1ee9ng"><i class="fas fa-xmark"></i></button></span>`).join('')}
                <input class="tr-tag-in" data-act="add-ls" data-v="${vi}" placeholder="+ th\u00eam d\u1ea5u ch\u1ee9ng r\u1ed3i Enter" aria-label="Th\u00eam d\u1ea5u ch\u1ee9ng">
            </div>
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-fire-flame-curved"></i> Y\u1ebfu t\u1ed1 nguy c\u01a1 / th\u00fac \u0111\u1ea9y</div>
            <input class="tr-in wide" data-k="yeuTo" data-v="${vi}" value="${esc(v.yeuTo)}"
                placeholder="vd h\u00fat thu\u1ed1c 40 g\u00f3i\u00b7n\u0103m, \u0111\u00e1i th\u00e1o \u0111\u01b0\u1eddng, d\u00f9ng corticoid k\u00e9o d\u00e0i" aria-label="Y\u1ebfu t\u1ed1 nguy c\u01a1">
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-triangle-exclamation"></i> C\u1ea7n lo\u1ea1i tr\u1eeb kh\u1ea9n</div>
            <div class="tr-tags">
                ${v.redFlags.map((x, i) => `<span class="tr-tag red" data-v="${vi}" data-r="${i}">${esc(x)}
                    <button type="button" data-act="del-red" aria-label="X\u00f3a"><i class="fas fa-xmark"></i></button></span>`).join('')}
                ${goiRed.map(x => `<button type="button" class="tr-sugg-b red" data-act="add-red" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}
                <input class="tr-tag-in" data-act="add-red-in" data-v="${vi}" placeholder="+ th\u00eam r\u1ed3i Enter" aria-label="Th\u00eam c\u1ea7n lo\u1ea1i tr\u1eeb">
            </div>
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-arrow-right-long"></i> Ngh\u0129 \u0111\u1ebfn</div>
            <input class="tr-in wide" data-k="nghiDen" data-v="${vi}" value="${esc(v.nghiDen)}"
                placeholder="C\u01a1 ch\u1ebf / h\u1ed9i ch\u1ee9ng m\u00e0 c\u00e1c d\u1ea5u ch\u1ee9ng tr\u00ean ch\u1ec9 \u0111i\u1ec3m" aria-label="Ngh\u0129 \u0111\u1ebfn">
        </div>

        <div class="tr-branch">
            <div class="tr-label"><i class="fas fa-code-branch"></i> C\u00e1c nguy\u00ean nh\u00e2n
                <button type="button" class="tr-mini" data-act="add-nn"><i class="fas fa-plus"></i> Th\u00eam nh\u00e1nh</button>
            </div>
            ${v.nguyenNhan.map((n, ni) => nguyenNhanHtml(n, vi, ni)).join('')
        || '<p class="tr-empty">Ch\u01b0a c\u00f3 nh\u00e1nh nguy\u00ean nh\u00e2n n\u00e0o.</p>'}
            ${goiY.length ? `<div class="tr-sugg"><span>G\u1ee3i \u00fd:</span>
                ${goiY.map(x => `<button type="button" class="tr-sugg-b" data-act="sugg" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
            ${goiCls.length ? `<div class="tr-sugg cls"><span>CLS hay d\u00f9ng:</span>
                ${goiCls.map(x => `<button type="button" class="tr-sugg-b cls" data-act="sugg-cls" data-text="${esc(x)}">+ ${esc(x)}</button>`).join('')}</div>` : ''}
        </div>

        <div class="tr-branch last">
            <div class="tr-label"><i class="fas fa-notes-medical"></i> Bi\u1ebfn ch\u1ee9ng c\u1ea7n b\u00e0n
                <button type="button" class="tr-mini" data-act="add-bc"><i class="fas fa-plus"></i> Th\u00eam bi\u1ebfn ch\u1ee9ng</button>
            </div>
            ${v.bienChung.map((b, bi) => bienChungHtml(b, vi, bi)).join('')
        || '<p class="tr-empty">Ch\u01b0a ghi bi\u1ebfn ch\u1ee9ng n\u00e0o.</p>'}
        </div>
    </div>`;
}

let mapMode = false;
let mapHits = [];

/** Vẽ lại sơ đồ khi đang ở chế độ xem bản đồ */
function refreshMap() {
    const cv = $('bl-map');
    if (!cv || !mapMode) return;
    const wrap = $('bl-map-wrap');
    const w = Math.max(760, wrap.clientWidth || 900);
    mapHits = drawMap(cv, getBienLuan().vanDe, { width: w }).hits;
}

function render() {
    if (!host) return;
    host.innerHTML = `<div class="tr-bar">
            <button type="button" class="bl-mini" data-add="sync"><i class="fas fa-wand-magic-sparkles"></i> Lấy vấn đề từ mục VIII</button>
            <button type="button" class="bl-mini" data-add="vanDe"><i class="fas fa-plus"></i> Thêm vấn đề</button>
            <input id="tr-search" class="tr-search" placeholder="Tìm mẫu biện luận (ví dụ: khó thở, đau bụng, sốc…)" aria-label="Tìm mẫu biện luận">
            <span class="tr-hint">Điền vào sơ đồ, máy sẽ chuyển thành đoạn văn biện luận.</span>
        </div>
        <div id="tr-search-res" class="tr-search-res"></div>`
        + (data.vanDe.length ? data.vanDe.map(vanDeHtml).join('')
            : `<p class="tr-empty big">Chưa có vấn đề nào — điền mục VIII rồi bấm “Lấy vấn đề từ mục VIII”.</p>`);
    refreshMap();
}

/* ---------- chuyển cây thành văn xuôi ---------- */
export function buildProse() {
    const out = [];
    getBienLuan().vanDe.forEach((v, i) => {
        out.push(`${i + 1}. Vấn đề ${i + 1}: ${trim(v.ten) || '(chưa đặt tên)'}`);
        if (v.lamSang.length) out.push(`Lâm sàng ghi nhận: ${v.lamSang.join('; ')}.`);
        if (trim(v.yeuTo)) out.push(`Yếu tố nguy cơ / thúc đẩy: ${trim(v.yeuTo)}.`);
        if (trim(v.nghiDen)) out.push(`→ Nghĩ đến: ${trim(v.nghiDen)}.`);

        if (v.nguyenNhan.length) {
            out.push('→ Các nguyên nhân cần nghĩ:');
            v.nguyenNhan.forEach(n => {
                const muc = n.muc || LEVELS[1];
                const ly = trim(n.lyDo) ? `${trim(n.lyDo)} ` : '';
                out.push(`   • ${trim(n.ten)}: ${ly}→ ${muc.toLowerCase()}.`);
            });
        }
        if (v.redFlags.length) {
            out.push(`→ Cần loại trừ khẩn: ${v.redFlags.join('; ')}.`);
        }
        const clsList = [...new Set(v.nguyenNhan.map(n => trim(n.cls)).filter(Boolean))];
        if (clsList.length) out.push(`→ Đề nghị cận lâm sàng để phân định: ${clsList.join('; ')}.`);
        if (v.bienChung.length) {
            out.push('→ Biến chứng cần theo dõi:');
            v.bienChung.forEach(b => out.push(`   • ${trim(b.ten)}${trim(b.lapLuan) ? `: ${trim(b.lapLuan)}` : ''}.`));
        }
        out.push('');
    });

    const { soBo, phanBiet } = derivedDiagnosis();
    if (soBo || phanBiet) {
        out.push('Tổng hợp các vấn đề trên:');
        if (soBo) out.push(`→ Nghĩ nhiều nhất đến ${soBo} (chẩn đoán sơ bộ).`);
        if (phanBiet) out.push(`→ Cần phân biệt với: ${phanBiet.split('\n').join('; ')}.`);
    }
    return out.join('\n').trim();
}

/** Tập hợp cận lâm sàng đã ghi ở các nhánh — để đổ sang mục XI */
export function derivedCls() {
    const all = getBienLuan().vanDe.flatMap(v => v.nguyenNhan.map(n => trim(n.cls)).filter(Boolean));
    return [...new Set(all.flatMap(x => x.split(/[;,]/).map(t => t.trim()).filter(Boolean)))];
}

/** Suy chẩn đoán sơ bộ / phân biệt từ mức độ nghĩ của các nhánh */
export function derivedDiagnosis() {
    const all = getBienLuan().vanDe.flatMap(v => v.nguyenNhan);
    const soBo = all.filter(n => n.muc === LEVELS[0]).map(n => trim(n.ten));
    const phanBiet = all.filter(n => n.muc === LEVELS[1] || n.muc === LEVELS[2])
        .map(n => trim(n.ten) + (trim(n.lyDo) ? ` — ${trim(n.lyDo)}` : ''));
    return { soBo: [...new Set(soBo)].join('; '), phanBiet: [...new Set(phanBiet)].join('\n') };
}

/* ---------- khởi động ---------- */
export function initBienLuan(options) {
    onChangeCb = options?.onChange || (() => { });
    host = $('bl-host');
    if (!host) return;
    render();
    setupMapUi();

    const vd = (el) => data.vanDe[+el.closest('[data-v]').dataset.v];

    const onEdit = (e) => {
        const el = e.target;
        if (!el.dataset.k) return;
        const leaf = el.closest('.tr-leaf');
        const v = vd(el);
        if (!v) return;
        if (leaf && leaf.dataset.n !== undefined) v.nguyenNhan[+leaf.dataset.n][el.dataset.k] = el.value;
        else if (leaf && leaf.dataset.b !== undefined) v.bienChung[+leaf.dataset.b][el.dataset.k] = el.value;
        else v[el.dataset.k] = el.value;
        if (el.dataset.k === 'muc' || (el.dataset.k === 'ten' && !leaf)) render();
        onChangeCb();
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);

    // Enter ở ô "thêm dấu chứng" -> gắn thành một nhánh lá
    host.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.dataset.act === 'add-red-in') {
            e.preventDefault();
            const text = trim(e.target.value);
            if (!text) return;
            data.vanDe[+e.target.dataset.v].redFlags.push(text);
            render();
            onChangeCb();
            return;
        }
        if (e.key !== 'Enter' || e.target.dataset.act !== 'add-ls') return;
        e.preventDefault();
        const text = trim(e.target.value);
        if (!text) return;
        data.vanDe[+e.target.dataset.v].lamSang.push(text);
        render();
        onChangeCb();
        host.querySelector(`[data-act="add-ls"][data-v="${e.target.dataset.v}"]`)?.focus();
    });

    host.addEventListener('input', (e) => {
        if (e.target.id !== 'tr-search') return;
        const box = $('tr-search-res');
        const found = searchLibrary(e.target.value);
        box.innerHTML = found.length
            ? found.map(x => `<button type="button" class="tr-found" data-tpl="${esc(x.k)}">
                <b>${esc(x.k)}</b><small>${esc(x.nn.slice(0, 3).join(' \u00b7 '))}\u2026</small></button>`).join('')
            : (trim(e.target.value) ? '<p class="tr-empty">Kh\u00f4ng t\u00ecm th\u1ea5y m\u1eabu ph\u00f9 h\u1ee3p.</p>' : '');
    });

    host.addEventListener('click', (e) => {
        const tpl = e.target.closest('[data-tpl]');
        if (tpl) {
            const lib = searchLibrary(tpl.dataset.tpl)[0];
            if (lib) {
                data.vanDe.push(normalize({
                    ten: lib.k,
                    redFlags: (lib.red || []).slice(0, 3),
                    nguyenNhan: lib.nn.slice(0, 5).map(t => ({ ten: t, muc: LEVELS[1], lyDo: '', cls: '' }))
                }));
                render();
                onChangeCb();
            }
            return;
        }
        const add = e.target.closest('[data-add]');
        if (add) {
            if (add.dataset.add === 'sync') {
                if (!syncFromProblems()) options?.onNoProblems?.();
            } else {
                data.vanDe.push(normalize({ ten: '' }));
                render();
                onChangeCb();
                host.querySelector('.tr-card:last-of-type .tr-title')?.focus();
            }
            return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.tagName === 'INPUT') return;
        const box = btn.closest('[data-v]');
        const v = data.vanDe[+box.dataset.v];
        const act = btn.dataset.act;

        if (act === 'del-vd') data.vanDe.splice(+box.dataset.v, 1);
        else if (act === 'del-ls') v.lamSang.splice(+btn.closest('.tr-tag').dataset.s, 1);
        else if (act === 'del-nn') v.nguyenNhan.splice(+btn.closest('.tr-leaf').dataset.n, 1);
        else if (act === 'del-bc') v.bienChung.splice(+btn.closest('.tr-leaf').dataset.b, 1);
        else if (act === 'add-nn') v.nguyenNhan.push({ id: newId(), ten: '', muc: LEVELS[1], lyDo: '' });
        else if (act === 'add-bc') v.bienChung.push({ id: newId(), ten: '', lapLuan: '' });
        else if (act === 'sugg') v.nguyenNhan.push({ id: newId(), ten: btn.dataset.text, muc: LEVELS[1], lyDo: '', cls: '' });
        else if (act === 'add-red') { if (!v.redFlags.includes(btn.dataset.text)) v.redFlags.push(btn.dataset.text); }
        else if (act === 'del-red') v.redFlags.splice(+btn.closest('.tr-tag').dataset.r, 1);
        else if (act === 'sugg-cls') {
            const target = v.nguyenNhan.find(n => !trim(n.cls)) || v.nguyenNhan[0];
            if (!target) v.nguyenNhan.push({ id: newId(), ten: '', muc: LEVELS[1], lyDo: '', cls: btn.dataset.text });
            else target.cls = [trim(target.cls), btn.dataset.text].filter(Boolean).join('; ');
        }
        else if (act === 'dup-vd') data.vanDe.splice(+box.dataset.v + 1, 0, normalize({ ...v, id: null }));
        else if (act === 'up' && +box.dataset.v > 0) {
            const i = +box.dataset.v;
            [data.vanDe[i - 1], data.vanDe[i]] = [data.vanDe[i], data.vanDe[i - 1]];
        }
        else if (act === 'down' && +box.dataset.v < data.vanDe.length - 1) {
            const i = +box.dataset.v;
            [data.vanDe[i + 1], data.vanDe[i]] = [data.vanDe[i], data.vanDe[i + 1]];
        }
        else return;

        render();
        onChangeCb();
    });
}


/* ---------- chế độ xem sơ đồ ---------- */
function setupMapUi() {
    const seg = $('bl-mode');
    const wrap = $('bl-map-wrap');
    if (!seg || !wrap) return;

    seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        mapMode = b.dataset.mode === 'map';
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        wrap.classList.toggle('is-hidden', !mapMode);
        host.classList.toggle('is-hidden', mapMode);
        refreshMap();
    });

    // Bấm vào node vấn đề trên sơ đồ -> quay về bảng, con trỏ nhảy đúng ô
    $('bl-map')?.addEventListener('click', (e) => {
        const cv = e.currentTarget;
        const r = cv.getBoundingClientRect();
        const sx = (e.clientX - r.left) * (cv.width / (window.devicePixelRatio || 1) / r.width);
        const sy = (e.clientY - r.top) * (cv.height / (window.devicePixelRatio || 1) / r.height);
        const hit = mapHits.find(h => sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h);
        if (!hit) return;
        seg.querySelector('[data-mode="table"]').click();
        const card = host.querySelector(`.tr-card[data-v="${hit.index}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.querySelector('.tr-title')?.focus();
    });

    $('bl-png')?.addEventListener('click', () => downloadMapPng(getBienLuan().vanDe));

    const ov = $('map-overlay');
    $('bl-zoom')?.addEventListener('click', () => {
        ov.classList.remove('hidden');
        drawMap($('map-overlay-canvas'), getBienLuan().vanDe, { width: 1400, scale: 2 });
    });
    $('map-overlay-close')?.addEventListener('click', () => ov.classList.add('hidden'));
    $('map-overlay-png')?.addEventListener('click', () => downloadMapPng(getBienLuan().vanDe));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov?.classList.add('hidden'); });
    window.addEventListener('resize', () => refreshMap());
}
