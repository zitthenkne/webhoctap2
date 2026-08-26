// lien-ket-map.js — bản đồ mạng lưới của cả bệnh án.
//
// Bệnh án hay bị rời rạc: khám ra dấu chứng nhưng không đặt thành vấn đề, đặt
// vấn đề nhưng không biện luận, đề nghị cận lâm sàng nhưng không nói để làm gì,
// kê thuốc nhưng không rõ trị cho chẩn đoán nào. Ở đây gom tất cả thành 5 cột
// nối nhau và chỉ thẳng vào chỗ đứt:
//
//   Dữ kiện → Vấn đề → Hướng chẩn đoán → Cận lâm sàng → Điều trị
//
// Mọi liên kết đều lấy từ dữ liệu người dùng đã nhập (dấu chứng ủng hộ của từng
// vấn đề, nguyên nhân trong cây biện luận, ô "CLS để phân định"), không đoán mò.

import { getBienLuan, derivedClsDetail } from './bien-luan-editor.js';
import { getClinicalContext, getSteps } from './benh-su-editor.js';
import { abnormalItems } from './cls-shared.js';
import { getCls } from './cls-editor.js';
import { getRx, rxLine } from './rx-editor.js';
import { benhCuaThuoc } from './thuoc-data.js';
import { NORMAL_EXAM } from './goi-y-nhap.js';
import { parseCls } from './cls-de-nghi.js';
import { fold } from './tim-kiem.js';

const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value || '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitLines = (v) => String(v || '').split('\n')
    .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
const bareName = (t) => String(t || '').replace(/\s+—\s+.*$/, '').trim();

/** Hai đoạn chữ có nói về cùng một thứ không (bỏ dấu, so bao hàm) */
function near(a, b) {
    const x = fold(bareName(a)), y = fold(bareName(b));
    if (!x || !y || x.length < 3 || y.length < 3) return false;
    return x.includes(y) || y.includes(x);
}

export const COLS = [
    { key: 'dukien', title: 'Dữ kiện', icon: 'fa-magnifying-glass' },
    { key: 'vande', title: 'Vấn đề', icon: 'fa-list-check' },
    { key: 'chandoan', title: 'Hướng chẩn đoán', icon: 'fa-diagnoses' },
    { key: 'cls', title: 'Cận lâm sàng', icon: 'fa-vials' },
    { key: 'dieutri', title: 'Điều trị', icon: 'fa-prescription-bottle-medical' }
];

const EXAM_FIELDS = [['Tổng trạng', 'exam-general'], ['Đầu – cổ', 'exam-head'], ['Ngực', 'exam-chest'],
['Tim', 'exam-heart'], ['Phổi', 'exam-lung'], ['Bụng', 'exam-abdomen'], ['Thần kinh – cơ xương khớp', 'exam-neuro-msk']];

const VITALS = [
    ['Mạch', 'vital-pulse', v => v > 100 || v < 60, 'l/p'],
    ['Nhiệt độ', 'vital-temp', v => v > 37.5 || v < 36, '°C'],
    ['Nhịp thở', 'vital-resp', v => v > 20, 'l/p'],
    ['SpO2', 'vital-spo2', v => v < 95, '%']
];

/* ---------------------------------------------------------------- cột 1 */
function duKien() {
    const out = [];
    const add = (text, tab, field, sub) => {
        if (!text || out.some(x => x.text === text)) return;
        out.push({ text, tab, field, sub });
    };

    getClinicalContext().forEach(s => add(s.ten, 'lydo-tiensu', 'hx-sym-name', 'cơ năng'));
    getSteps().forEach(m => String(m.s || '').split(';').map(x => x.trim()).filter(Boolean)
        .forEach(t => add(t, 'lydo-tiensu', 'hx-steps', 'diễn tiến')));

    VITALS.forEach(([lab, id, bad, u]) => {
        const n = parseFloat(val(id));
        if (!isNaN(n) && bad(n)) add(`${lab} ${val(id)} ${u}`, 'kham-benh', id, 'sinh hiệu');
    });
    const bp = val('vital-bp').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    if (bp && (+bp[1] >= 140 || +bp[2] >= 90 || +bp[1] < 90))
        add(`Huyết áp ${val('vital-bp')} mmHg`, 'kham-benh', 'vital-bp', 'sinh hiệu');

    EXAM_FIELDS.forEach(([lab, id]) => {
        const v = val(id);
        if (!v || v === NORMAL_EXAM[id]) return;      // mẫu "khám bình thường" không phải dấu chứng
        v.split('\n').map(x => x.trim()).filter(x => x && !/^ch[ưu]a ghi nh[ậa]n/i.test(x))
            .forEach(t => add(t, 'kham-benh', id, lab.toLowerCase()));
    });

    abnormalItems(getCls()).forEach(i => add(
        `${i.n} ${i.v}${i.u ? ' ' + i.u : ''} ${i.flag === 'high' ? '↑' : '↓'}`,
        'can-lam-sang', 'cls-host', 'cận lâm sàng'));

    splitLines(val('history-internal')).filter(t => !/^ch[ưu]a ghi nh[ậa]n/i.test(t))
        .forEach(t => add(t, 'lydo-tiensu', 'history-internal', 'tiền căn'));

    return out.slice(0, 26);
}

/* ------------------------------------------------------------- dựng mạng */
/**
 * Gom toàn bộ bệnh án thành đồ thị 5 cột.
 * @returns {{nodes:Array, edges:Array<[string,string]>, breaks:Array}}
 */
export function buildNetwork() {
    const nodes = [], edges = [];
    let seq = 0;
    const mk = (col, o) => {
        const n = { id: `n${++seq}`, col, warn: '', ...o };
        nodes.push(n);
        return n;
    };
    const link = (a, b) => { if (a && b) edges.push([a.id, b.id]); };

    const vanDe = getBienLuan().vanDe || [];

    /* cột 2 — vấn đề (thẻ biện luận + dòng ở mục VIII chưa thành thẻ) */
    const vdNodes = vanDe.map((v, i) => mk('vande', {
        text: v.ten || `Vấn đề ${i + 1}`, tab: 'chan-doan-dieu-tri', field: 'bl-host',
        warn: v.nguyenNhan?.length ? '' : 'chưa biện luận nguyên nhân nào',
        raw: v
    }));
    splitLines(val('problem-list'))
        .filter(t => !vanDe.some(v => near(v.ten, t)))
        .forEach(t => vdNodes.push(mk('vande', {
            text: t, tab: 'chan-doan-dieu-tri', field: 'problem-list',
            warn: 'chưa tạo thẻ biện luận ở mục X', raw: null
        })));

    /* cột 1 — dữ kiện, nối vào vấn đề qua ô "dấu chứng lâm sàng ủng hộ" */
    duKien().forEach(d => {
        const n = mk('dukien', d);
        const hits = vdNodes.filter(v => (v.raw?.lamSang || []).some(ls => near(ls, d.text))
            || near(v.text, d.text));
        hits.forEach(v => link(n, v));
        if (!hits.length) n.warn = 'chưa được dùng cho vấn đề nào';
    });

    /* cột 3 — hướng chẩn đoán, lấy thẳng từ nhánh nguyên nhân của từng vấn đề */
    const dxNodes = [];
    vanDe.forEach((v, i) => (v.nguyenNhan || []).forEach(n => {
        if (!String(n.ten || '').trim()) return;
        const node = mk('chandoan', {
            text: n.ten, sub: n.muc, tab: 'chan-doan-dieu-tri', field: 'bl-host',
            warn: !String(n.lyDo || '').trim() ? 'chưa có lý do biện luận'
                : !String(n.cls || '').trim() ? 'chưa có cận lâm sàng phân định' : ''
        });
        link(vdNodes[i], node);
        dxNodes.push(node);
    }));
    /* Chẩn đoán gõ thẳng ở mục IX mà cây biện luận không có -> nhánh mồ côi */
    [...splitLines(val('dx1-main')), ...splitLines(val('dx2-main'))]
        .filter(t => !dxNodes.some(d => near(d.text, t)))
        .forEach(t => dxNodes.push(mk('chandoan', {
            text: t, tab: 'chan-doan-dieu-tri', field: 'dx1-main',
            warn: 'chưa qua biện luận ở mục X'
        })));

    /* cột 4 — cận lâm sàng, nối về đúng nguyên nhân mà nó phân định */
    const clsNodes = [];
    derivedClsDetail().forEach(c => {
        const node = mk('cls', { text: c.ten, sub: c.mucDich, tab: 'chan-doan-dieu-tri', field: 'labs-proposed' });
        const dx = dxNodes.find(d => near(d.text, c.dich));
        if (dx) link(dx, node); else node.warn = 'chưa rõ phân định cho hướng nào';
        clsNodes.push(node);
    });
    // Đề nghị gõ tay, không sinh ra từ nhánh nào: vẫn vẽ, nhưng chỉ kêu thiếu khi
    // chính dòng đó chưa nói được đề nghị để làm gì.
    splitLines(val('labs-proposed'))
        .filter(t => !clsNodes.some(c => near(c.text, t)))
        .forEach(t => {
            const r = parseCls(t);
            clsNodes.push(mk('cls', {
                text: r.ten || t, sub: [r.mucDich, r.dich].filter(Boolean).join(' '),
                tab: 'chan-doan-dieu-tri', field: 'labs-proposed',
                warn: r.mucDich ? '' : 'chưa gắn mục đích — đề nghị để làm gì?'
            }));
        });

    /* cột 5 — điều trị, nối về chẩn đoán qua thư viện thuốc theo bệnh */
    getRx().forEach(r => {
        const node = mk('dieutri', { text: r.ten, sub: rxLine(r).replace(r.ten, '').trim(), tab: 'ket-luan', field: 'rx-list' });
        const benh = benhCuaThuoc(r.ten);
        const hits = dxNodes.filter(d => benh.some(b => near(b, d.text)));
        hits.forEach(d => link(d, node));
        if (!hits.length) node.warn = 'chưa thấy chẩn đoán nào tương ứng';
    });

    const breaks = nodes.filter(n => n.warn);
    return { nodes, edges, breaks };
}

/* ------------------------------------------------------------- vẽ ra DOM */
export function renderNetwork(host, model, onGo) {
    if (!host) return;
    const { nodes, edges } = model;
    if (!nodes.length) {
        host.innerHTML = `<p class="net-empty"><i class="fas fa-diagram-project"></i>
            Chưa có gì để nối. Nhập bệnh sử, khám và đặt vấn đề rồi quay lại.</p>`;
        return;
    }
    const deg = new Map();
    edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });

    host.innerHTML = `<div class="net-grid">${COLS.map(c => {
        const list = nodes.filter(n => n.col === c.key);
        return `<div class="net-col" data-col="${c.key}">
            <div class="net-colhead"><i class="fas ${c.icon}"></i> ${c.title}<span>${list.length}</span></div>
            ${list.length ? list.map(n => `
                <button type="button" class="net-node${n.warn ? ' is-break' : ''}${deg.get(n.id) ? '' : ' is-loose'}"
                    data-id="${n.id}" data-tab="${esc(n.tab || '')}" data-field="${esc(n.field || '')}"
                    title="${esc(n.warn || 'Bấm để tới ô này trong bệnh án')}">
                    <span class="net-txt">${esc(n.text)}</span>
                    ${n.sub ? `<span class="net-sub">${esc(n.sub)}</span>` : ''}
                    ${n.warn ? `<span class="net-warn"><i class="fas fa-link-slash"></i> ${esc(n.warn)}</span>` : ''}
                </button>`).join('')
            : '<p class="net-none">— trống —</p>'}
        </div>`;
    }).join('')}<svg class="net-wires" aria-hidden="true"></svg></div>`;

    host.querySelectorAll('.net-node').forEach(b => {
        b.addEventListener('click', () => onGo?.(b.dataset.tab, b.dataset.field));
        b.addEventListener('mouseenter', () => spotlight(host, edges, b.dataset.id));
        b.addEventListener('mouseleave', () => spotlight(host, edges, null));
    });

    host._netEdges = edges;
    drawWires(host, edges);
}

/** Rê chuột vào một node thì làm mờ những gì không dính tới nó */
function spotlight(host, edges, id) {
    const grid = host.querySelector('.net-grid');
    if (!grid) return;
    grid.classList.toggle('is-focus', !!id);
    if (!id) {
        grid.querySelectorAll('.is-on').forEach(e => e.classList.remove('is-on'));
        return;
    }
    const keep = new Set([id]);
    edges.forEach(([a, b]) => { if (a === id) keep.add(b); if (b === id) keep.add(a); });
    grid.querySelectorAll('.net-node').forEach(n => n.classList.toggle('is-on', keep.has(n.dataset.id)));
    grid.querySelectorAll('.net-wire').forEach(w => w.classList.toggle('is-on',
        keep.has(w.dataset.a) && keep.has(w.dataset.b)));
}

/** Vẽ dây nối giữa các node bằng SVG theo vị trí thật sau khi đã dựng xong DOM */
function drawWires(host, edges) {
    const grid = host.querySelector('.net-grid');
    const svg = host.querySelector('.net-wires');
    if (!grid || !svg) return;
    // Màn hẹp thì các cột xếp chồng, kẻ dây chỉ thành mớ rối — để trống
    if (grid.clientWidth < 720) { svg.innerHTML = ''; return; }

    const box = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${grid.scrollHeight}`);
    svg.style.height = grid.scrollHeight + 'px';
    const at = (id) => {
        const el = grid.querySelector(`.net-node[data-id="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left - box.left, r: r.right - box.left, y: r.top - box.top + r.height / 2 };
    };
    svg.innerHTML = edges.map(([a, b]) => {
        const p = at(a), q = at(b);
        if (!p || !q) return '';
        const x1 = p.r + 2, x2 = q.l - 2, mx = (x1 + x2) / 2;
        return `<path class="net-wire" data-a="${a}" data-b="${b}"
            d="M${x1} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${x2} ${q.y}"/>`;
    }).join('');
}

/** Vẽ lại dây khi đổi kích thước cửa sổ (gọi từ nơi mở bản đồ) */
export function redrawWires(host) {
    if (host?._netEdges) drawWires(host, host._netEdges);
}
