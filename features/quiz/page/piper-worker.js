// File: features/quiz/page/piper-worker.js
// Web Worker chạy giọng đọc tiếng Việt MIỄN PHÍ của Piper (rhasspy/piper, giấy phép MIT) ngay trong trình duyệt,
// để suy luận ONNX không làm đứng giao diện. Dựa trên cách @diffusionstudio/vits-web gọi (đã đọc mã nguồn).
//  - onnxruntime-web 1.18 (wasm) + bộ phiên âm espeak-ng: nạp từ jsDelivr (service worker tự lưu lại cho lần sau)
//  - model .onnx + .json: tải từ HuggingFace, lưu trong Cache Storage 'zitthenkne-piper' (sw.js giữ nguyên kho này)
// Giao thức (main -> worker): {cmd:'prepare',voice} · {cmd:'say',id,voice,chunks,rate} · {cmd:'cancel',id} · {cmd:'remove',voice}
// (worker -> main): {type:'progress',voice,phase,loaded,total} · {type:'ready',voice} · {type:'chunk',id,i,wav} ·
//                   {type:'done',id,count} · {type:'error',id?,voice?,message}

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
const PHON_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const GLUE_URL = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js';
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/';
const CACHE = 'zitthenkne-piper';
const PATHS = {
    'vi_VN-vais1000-medium': 'vais1000/medium/',
    'vi_VN-25hours_single-low': '25hours_single/low/',
    'vi_VN-vivos-x_low': 'vivos/x_low/'
};
const modelUrl = (v) => `${HF}${PATHS[v]}${v}.onnx`;

let ort = null, glue = null;
let loaded = { voice: null, session: null, cfg: null };
const cancelled = new Set();

async function loadLibs() {
    if (!ort) {
        ort = await import(ORT_BASE + 'esm/ort.wasm.min.js');
        ort.env.wasm.wasmPaths = ORT_BASE;
        ort.env.wasm.numThreads = 1;   // không có cross-origin isolation -> chỉ 1 luồng; worker đã tách khỏi giao diện
    }
    if (!glue) glue = await import(GLUE_URL);
}

// Lấy tệp từ Cache Storage, chưa có thì tải (báo tiến độ) rồi lưu
async function getBuf(url, onProgress) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
    const net = await fetch(url);
    if (!net.ok) throw new Error('HTTP ' + net.status + ' khi tải ' + url.split('/').pop());
    const total = +net.headers.get('content-length') || 0;
    const reader = net.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (onProgress) onProgress(got, total);
    }
    const blob = new Blob(parts);
    await cache.put(url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }));
    return blob.arrayBuffer();
}

// Phiên âm nhiều đoạn bằng MỘT lần khởi tạo espeak-ng (khởi tạo nạp ~18MB dữ liệu, không nên làm mỗi câu).
// Trả về danh sách ÂM VỊ từng đoạn (chuỗi), KHÔNG dùng `phoneme_ids` của bộ phiên âm: đó là bảng id mặc định,
// còn giọng tiếng Việt có bảng riêng (cfg.phoneme_id_map, 130 mục) -> dùng id mặc định sẽ vượt phạm vi embedding và lỗi.
async function phonemize(texts, espeakVoice) {
    const out = [];
    const pm = await glue.createPiperPhonemize({
        print: (line) => { try { out.push(JSON.parse(line).phonemes); } catch (e) { /* dòng không phải JSON: bỏ */ } },
        printErr: () => { /* espeak hay in cảnh báo vô hại */ },
        locateFile: (f) => f.endsWith('.wasm') ? PHON_BASE + '.wasm' : f.endsWith('.data') ? PHON_BASE + '.data' : f
    });
    pm.callMain(['-l', espeakVoice, '--input', JSON.stringify(texts.map((text) => ({ text }))), '--espeak_data', '/espeak-ng-data']);
    if (out.length !== texts.length) throw new Error(`Phiên âm trả ${out.length}/${texts.length} đoạn`);
    return out;
}

// Cách Piper dựng chuỗi id: ^ _ (âm vị _)... $  — âm vị không có trong bảng thì bỏ qua
function toIds(phonemes, map) {
    const ids = [...map['^'], ...map._];
    for (const p of phonemes) {
        if (map[p]) ids.push(...map[p], ...map._);
    }
    ids.push(...map.$);
    return ids;
}

async function loadVoice(voice, report) {
    if (!PATHS[voice]) throw new Error('Giọng không có trong danh sách: ' + voice);
    if (loaded.voice === voice) return loaded;
    report('lib', 0, 0);
    await loadLibs();
    const url = modelUrl(voice);
    const cfg = JSON.parse(new TextDecoder().decode(await getBuf(url + '.json')));
    const buf = await getBuf(url, (l, t) => report('model', l, t));
    report('init', 0, 0);
    const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    loaded = { voice, session, cfg };
    return loaded;
}

function wav16(samples, rate) {
    const n = samples.length, view = new DataView(new ArrayBuffer(44 + n * 2));
    const tag = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    tag(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767 | 0, true);
    return view.buffer;
}

async function say({ id, voice, chunks, rate }) {
    const v = await loadVoice(voice, (phase, l, t) => postMessage({ type: 'progress', voice, phase, loaded: l, total: t }));
    const ids = (await phonemize(chunks, v.cfg.espeak.voice)).map((ph) => toIds(ph, v.cfg.phoneme_id_map));
    const speakerMap = v.cfg.speaker_id_map || {};
    // tốc độ: length_scale lớn = đọc chậm; chia cho `rate` để 1,2 = nhanh hơn 20% mà không méo giọng như tua audio
    const scales = [v.cfg.inference.noise_scale, v.cfg.inference.length_scale / (rate || 1), v.cfg.inference.noise_w];
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        if (cancelled.has(id)) break;
        const seq = BigInt64Array.from(ids[i].map(BigInt));
        const feeds = {
            input: new ort.Tensor('int64', seq, [1, seq.length]),
            input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(seq.length)]), [1]),
            scales: new ort.Tensor('float32', Float32Array.from(scales), [3])
        };
        if (Object.keys(speakerMap).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
        const { output } = await v.session.run(feeds);
        if (cancelled.has(id)) break;
        const wav = wav16(output.data, v.cfg.audio.sample_rate);
        postMessage({ type: 'chunk', id, i, wav }, [wav]);
        count++;
    }
    cancelled.delete(id);
    postMessage({ type: 'done', id, count });
}

self.onmessage = async ({ data }) => {
    try {
        if (data.cmd === 'cancel') { cancelled.add(data.id); return; }
        if (data.cmd === 'prepare') {
            const v = await loadVoice(data.voice, (phase, l, t) => postMessage({ type: 'progress', voice: data.voice, phase, loaded: l, total: t }));
            await phonemize(['xin chào'], v.cfg.espeak.voice);   // nạp sẵn dữ liệu espeak-ng vào bộ nhớ đệm của service worker
            postMessage({ type: 'ready', voice: data.voice });
            return;
        }
        if (data.cmd === 'remove') {
            const cache = await caches.open(CACHE);
            await cache.delete(modelUrl(data.voice)); await cache.delete(modelUrl(data.voice) + '.json');
            if (loaded.voice === data.voice) loaded = { voice: null, session: null, cfg: null };
            postMessage({ type: 'removed', voice: data.voice });
            return;
        }
        if (data.cmd === 'say') await say(data);
    } catch (e) {
        postMessage({ type: 'error', id: data.id, voice: data.voice, message: String(e && e.message || e) });
    }
};
