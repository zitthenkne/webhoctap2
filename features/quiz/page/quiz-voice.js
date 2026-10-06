// File: features/quiz/page/quiz-voice.js
// Giọng đọc câu hỏi — CHỈ giọng miễn phí hỗ trợ tiếng Việt:
//  1. Giọng có sẵn trong máy (speechSynthesis): chỉ liệt kê giọng tiếng Việt (vi-*). Tùy máy: iPhone/iPad có Linh,
//     Windows có thể thêm Tiếng Việt, Edge có HoaiMy/NamMinh (Natural), Chrome có Google Tiếng Việt.
//  2. Piper (rhasspy/piper, MIT): 3 giọng Việt chạy ngay trong trình duyệt bằng Web Worker (piper-worker.js).
//     Nặng (28–63 MB/giọng + ~29 MB thư viện lần đầu) nên CHỈ tải khi người dùng bấm "Tải về"; sau đó dùng offline.
// Lưu: quiz_voice ('sys:<voiceURI>' | 'piper:<id>'), quiz_voice_rate. Kho giọng Piper: Cache Storage 'zitthenkne-piper'.

import { showToast } from '../../../core/utils.js';

const LS = { voice: 'quiz_voice', rate: 'quiz_voice_rate' };
const CACHE = 'zitthenkne-piper';
// Bản sao của hằng số trong piper-worker.js (worker là file riêng, không import chung được)
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/';
const PIPER = [
    { id: 'vi_VN-vais1000-medium', path: 'vais1000/medium/', name: 'Piper · Vais1000 (tốt nhất)', mb: 63 },
    { id: 'vi_VN-25hours_single-low', path: '25hours_single/low/', name: 'Piper · 25 giờ', mb: 63 },
    { id: 'vi_VN-vivos-x_low', path: 'vivos/x_low/', name: 'Piper · Vivos (nhẹ nhất)', mb: 28 }
];
const LIB_MB = 29;   // onnxruntime-web (~11) + dữ liệu espeak-ng (~18), chỉ tải lần đầu
const modelUrl = (p) => `${HF}${p.path}${p.id}.onnx`;
const SAMPLE = 'Xin chào, đây là giọng đọc câu hỏi của bạn.';
// WAV rỗng: phát một lần trong cú chạm để iOS mở khóa phần tử <audio> cho các lần phát sau (chờ worker xong mới phát)
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { } };
const $ = (id) => document.getElementById(id);
const hasSys = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const piperById = (id) => PIPER.find(p => p.id === id);

export const getRate = () => { const v = parseFloat(lsGet(LS.rate)); return isNaN(v) ? 1 : Math.min(1.4, Math.max(0.7, v)); };
const choice = () => lsGet(LS.voice) || '';
export const voiceSupported = () => hasSys() || typeof Worker !== 'undefined';

const audio = new Audio();          // một phần tử dùng lại cho mọi đoạn Piper
audio.preload = 'auto';
let unlocked = false, speaking = false, token = 0, onEndCb = null, worker = null;
const downloaded = new Set();       // id giọng Piper đã có trong máy

export const isSpeaking = () => speaking;

function unlock() {
    if (unlocked) return;
    try { audio.src = SILENT; audio.play().then(() => { unlocked = true; }).catch(() => { }); } catch (e) { }
}
function getWorker() {
    if (!worker) worker = new Worker(new URL('./piper-worker.js', import.meta.url), { type: 'module' });
    return worker;
}

function finish(t) {
    if (t !== token) return;
    speaking = false;
    const cb = onEndCb; onEndCb = null;
    if (cb) cb();
}

export function stopVoice() {
    if (worker) worker.postMessage({ cmd: 'cancel', id: token });   // worker bỏ các đoạn còn lại của lượt đang đọc
    token++;
    try { if (hasSys()) window.speechSynthesis.cancel(); } catch (e) { }
    try { audio.pause(); } catch (e) { }
    if (speaking) { speaking = false; const cb = onEndCb; onEndCb = null; if (cb) cb(); }
}

/* ------------------------------------------------------------ giọng trong máy (chỉ tiếng Việt) */
function sysVoices() {
    if (!hasSys()) return [];
    const nat = (v) => /natural|online/i.test(v.name) ? 0 : 1;   // bản neural (Edge) lên đầu
    return window.speechSynthesis.getVoices().filter(v => /^vi/i.test(v.lang))
        .sort((a, b) => nat(a) - nat(b) || a.name.localeCompare(b.name));
}
function pickSys() {
    const all = sysVoices();
    const c = choice();
    if (c.startsWith('sys:')) { const f = all.find(v => v.voiceURI === c.slice(4)); if (f) return f; }
    return all[0];
}
function speakSystem(text, t) {
    if (!hasSys()) { finish(t); showToast('Máy này chưa hỗ trợ đọc to.', 'info'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = getRate();
    const v = pickSys();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.onend = u.onerror = () => finish(t);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

/* ------------------------------------------------------------ Piper (Web Worker) */
// Cắt thành đoạn ngắn theo câu: đoạn đầu ngắn để tiếng cất lên sớm, các đoạn sau tổng hợp trong lúc đang đọc
function splitText(text) {
    const parts = (text.replace(/\s+/g, ' ').trim().match(/[^.!?…;:\n]+[.!?…;:]*/g) || []).map(s => s.trim()).filter(Boolean);
    const out = [];
    let cur = '';
    for (const p of parts) {
        const limit = out.length === 0 ? 110 : 220;
        if (cur && (cur + ' ' + p).length > limit) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
    }
    if (cur) out.push(cur);
    return out.flatMap(s => s.length <= 300 ? [s] : (s.match(/.{1,240}(\s|$)/g) || [s]).map(x => x.trim()));
}

function speakPiper(text, voiceId, t) {
    const chunks = splitText(text);
    if (!chunks.length) { finish(t); return; }
    const w = getWorker();
    const urls = [];
    let next = 0, total = -1, playing = false;
    const off = () => w.removeEventListener('message', onMsg);
    const playNext = () => {
        if (t !== token) { off(); urls.forEach(u => u && URL.revokeObjectURL(u)); return; }
        if (next < urls.length && urls[next]) {
            playing = true;
            const u = urls[next];
            const advance = () => { URL.revokeObjectURL(u); next++; playing = false; playNext(); };
            audio.onended = audio.onerror = advance;
            audio.src = u;
            audio.play().catch((e) => {
                if (e && e.name === 'NotAllowedError') showToast('Trình duyệt chặn phát tiếng — bấm nút loa lần nữa.', 'error');
                advance();
            });
        } else if (total >= 0 && next >= total) { off(); finish(t); }
    };
    const onMsg = ({ data }) => {
        if (data.id !== t) return;
        if (data.type === 'chunk') {
            urls[data.i] = URL.createObjectURL(new Blob([data.wav], { type: 'audio/wav' }));
            if (!playing) playNext();
        } else if (data.type === 'done') {
            total = data.count;
            if (!playing) playNext();
        } else if (data.type === 'error') {
            off();
            if (t !== token) return;
            showToast('Giọng Piper bị lỗi (' + String(data.message).slice(0, 80) + '). Tạm đọc bằng giọng trong máy.', 'error', 4500);
            speakSystem(text, t);
        }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ cmd: 'say', id: t, voice: voiceId, chunks, rate: getRate() });
}

async function refreshDownloaded() {
    downloaded.clear();
    try {
        const c = await caches.open(CACHE);
        for (const p of PIPER) {
            if (await c.match(modelUrl(p)) && await c.match(modelUrl(p) + '.json')) downloaded.add(p.id);
        }
    } catch (e) { /* trình duyệt không có Cache Storage: coi như chưa tải */ }
}

/** Đọc `text` bằng giọng đang chọn. Gọi TRỰC TIẾP trong cú chạm/phím (iOS chỉ cho phát tiếng khi có thao tác). */
export async function speak(text, onEnd) {
    stopVoice();
    const t = ++token;
    speaking = true;
    onEndCb = onEnd || null;
    const c = choice();
    if (c.startsWith('piper:')) {
        unlock();   // đồng bộ, trước mọi await — còn nằm trong cú chạm của người dùng
        const id = c.slice(6);
        if (!downloaded.size) await refreshDownloaded();
        if (t !== token) return;
        if (piperById(id) && downloaded.has(id)) { unlock(); speakPiper(text, id, t); return; }
        showToast('Giọng Piper này chưa tải về máy — mở "Giọng đọc" để tải. Tạm đọc bằng giọng trong máy.', 'info', 4200);
    }
    speakSystem(text, t);
}

/* ------------------------------------------------------------ Bảng chọn giọng (trong "Ngựa thì chỉnh") */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function setupVoiceSettings() {
    const sel = $('qs-voice');
    if (!sel) return;
    const rate = $('qs-voice-rate'), test = $('qs-voice-test');
    const dl = $('qs-voice-dl'), dlText = $('qs-voice-dl-text'), dlGo = $('qs-voice-dl-go'), dlBar = $('qs-voice-dl-bar');
    const del = $('qs-voice-del');
    let committed = '';          // giá trị ô chọn đã được lưu (để trả lại nếu người dùng bỏ tải)
    let pending = null;          // giọng Piper đang chờ tải
    let busy = false;

    const defaultValue = () => { const d = pickSys(); return d ? 'sys:' + d.voiceURI : ''; };
    const fill = async () => {
        await refreshDownloaded();
        const cur = choice();
        const sys = sysVoices();
        const sysHtml = sys.length
            ? sys.map(v => `<option value="sys:${esc(v.voiceURI)}">${esc(v.name.replace(/\s*[-–]\s*Vietnamese.*$/i, ''))}</option>`).join('')   // "Microsoft An - Vietnamese (Vietnam)" -> "Microsoft An"
            : '<option value="">Máy chưa có giọng tiếng Việt — dùng Piper bên dưới</option>';
        const piperHtml = PIPER.map(p => `<option value="piper:${p.id}">${esc(p.name)} — ${downloaded.has(p.id) ? 'đã tải ✓' : 'tải ~' + p.mb + ' MB'}</option>`).join('');
        sel.innerHTML = `<optgroup label="Có sẵn trong máy (tiếng Việt)">${sysHtml}</optgroup>`
            + `<optgroup label="Tải thêm — miễn phí, chạy ngay trong trình duyệt">${piperHtml}</optgroup>`;
        const usable = (v) => [...sel.options].some(o => o.value === v) && (!v.startsWith('piper:') || downloaded.has(v.slice(6)));
        committed = usable(cur) ? cur : defaultValue();
        sel.value = committed;
        if (del) del.hidden = !(committed.startsWith('piper:') && downloaded.has(committed.slice(6)));
    };
    fill();
    if (hasSys()) window.speechSynthesis.addEventListener('voiceschanged', () => { if (!busy) fill(); });   // Chrome nạp danh sách giọng muộn

    const showDownload = (p) => {
        pending = p;
        if (!dl) return;
        dl.hidden = false;
        dlText.textContent = `${p.name} cần tải ~${p.mb} MB${downloaded.size ? '' : ` (cộng ~${LIB_MB} MB thư viện lần đầu)`}. Chỉ tải một lần, sau đó dùng được cả khi mất mạng.`;
        dlGo.disabled = false;
        dlGo.textContent = 'Tải về';
        dlBar.hidden = true;
    };
    const hideDownload = () => { pending = null; if (dl) dl.hidden = true; };

    sel.addEventListener('change', () => {
        const v = sel.value;
        if (v.startsWith('piper:') && !downloaded.has(v.slice(6))) {
            showDownload(piperById(v.slice(6)));
            sel.value = committed;        // chưa tải xong thì chưa đổi giọng
            return;
        }
        hideDownload();
        committed = v;
        lsSet(LS.voice, v);
        stopVoice();
        if (del) del.hidden = !(v.startsWith('piper:'));
    });
    sel.addEventListener('click', (e) => e.stopPropagation());

    if (dlGo) dlGo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!pending || busy) return;
        if (!navigator.onLine) { showToast('Cần có mạng để tải giọng.', 'error'); return; }
        const p = pending, w = getWorker();
        busy = true;
        dlGo.disabled = true;
        dlBar.hidden = false; dlBar.removeAttribute('value');   // chưa biết tổng -> thanh chạy chờ
        dlGo.textContent = 'Đang tải thư viện…';
        const onMsg = async ({ data }) => {
            if (data.voice !== p.id) return;
            if (data.type === 'progress') {
                if (data.phase === 'lib') { dlGo.textContent = 'Đang tải thư viện…'; dlBar.removeAttribute('value'); }
                else if (data.phase === 'model') {
                    const pct = data.total ? Math.round(data.loaded * 100 / data.total) : 0;
                    dlGo.textContent = `Đang tải giọng… ${pct}%`;
                    if (data.total) { dlBar.max = 100; dlBar.value = pct; }
                } else { dlGo.textContent = 'Đang khởi động…'; dlBar.removeAttribute('value'); }
            } else if (data.type === 'ready') {
                w.removeEventListener('message', onMsg);
                busy = false;
                lsSet(LS.voice, 'piper:' + p.id);
                hideDownload();
                await fill();
                showToast(`Đã tải ${p.name}. Bấm "Nghe thử" nhé.`, 'success', 3600);
            } else if (data.type === 'error') {
                w.removeEventListener('message', onMsg);
                busy = false;
                dlGo.disabled = false; dlGo.textContent = 'Tải lại';
                dlBar.hidden = true;
                showToast('Tải giọng thất bại: ' + String(data.message).slice(0, 90), 'error', 4500);
            }
        };
        w.addEventListener('message', onMsg);
        w.postMessage({ cmd: 'prepare', voice: p.id });
    });

    if (del) del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = committed.startsWith('piper:') ? committed.slice(6) : '';
        if (!id) return;
        stopVoice();
        const w = getWorker();
        await new Promise((resolve) => {
            const h = ({ data }) => { if (data.type === 'removed' || data.type === 'error') { w.removeEventListener('message', h); resolve(); } };
            w.addEventListener('message', h);
            w.postMessage({ cmd: 'remove', voice: id });
        });
        lsDel(LS.voice);
        await fill();
        showToast('Đã xóa giọng khỏi máy này.', 'info');
    });

    if (rate) {
        rate.value = getRate();
        rate.addEventListener('input', () => lsSet(LS.rate, rate.value));
        rate.addEventListener('click', (e) => e.stopPropagation());
    }
    if (test) test.addEventListener('click', (e) => {
        e.stopPropagation();
        if (speaking) { stopVoice(); return; }
        speak(SAMPLE);
    });
}

/** Mở bảng "Ngựa thì chỉnh" và nhảy tới ô chọn giọng (bấm giữ nút loa). */
export function openVoiceSettings() {
    const fab = $('quiz-settings-fab'), pop = $('quiz-settings-popover'), sel = $('qs-voice');
    if (!fab || !pop) return;
    if (pop.classList.contains('hidden-pop')) fab.click();
    if (sel) setTimeout(() => { sel.scrollIntoView({ block: 'center' }); }, 60);
}
