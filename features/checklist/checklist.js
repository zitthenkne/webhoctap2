// Thư viện checklist — localStorage, key checklist_data_v1 (giữ tương thích data cũ).
// Node: {id, type:'checklist', name, steps:[{step,content,note}], createdAt}
// Tiến độ từng checklist: localStorage 'progress_'+id = {stepIndex: true}
(function(){
  const STORAGE_KEY = 'checklist_data_v1';
  let data = [];
  let csvSteps = null;
  let editingId = null; // null = tạo mới

  const $ = id => document.getElementById(id);
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8) }
  function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function load(){
    try{ data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }catch(e){ data = [] }
  }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }

  function progressOf(item){
    let prog = {};
    try{ prog = JSON.parse(localStorage.getItem('progress_' + item.id) || '{}') }catch(e){}
    const total = item.steps?.length || 0;
    let done = 0;
    for(let i = 0; i < total; i++) if(prog[i]) done++;
    return { done, total };
  }

  function renderCards(){
    const cards = $('cards');
    const kw = ($('searchInput').value || '').trim().toLowerCase();
    const lists = data.filter(n => n.type === 'checklist')
      .filter(n => !kw || (n.name || '').toLowerCase().includes(kw))
      .sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

    cards.innerHTML = '';
    $('emptyState').classList.toggle('hidden', lists.length > 0 || !!kw);
    if(lists.length === 0 && kw){
      cards.innerHTML = '<p class="col-span-full text-center text-gray-400 py-8">Không tìm thấy checklist nào 🥺</p>';
      return;
    }

    lists.forEach(item => {
      const { done, total } = progressOf(item);
      const pct = total ? Math.round(done / total * 100) : 0;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : '';
      let score = null;
      try{ score = JSON.parse(localStorage.getItem('checklist_score_' + item.id) || 'null') }catch(e){}
      const scoreHtml = score
        ? '<div class="text-xs font-semibold text-amber-600"><i class="fas fa-medal mr-1"></i>Điểm gần nhất ' + score.last.pct + '% · Cao nhất ' + score.best + '%</div>'
        : '';
      const runLabel = done === 0 ? '<i class="fas fa-play mr-1.5"></i>Thực hiện'
        : (done >= total ? '<i class="fas fa-rotate-right mr-1.5"></i>Làm lại'
        : '<i class="fas fa-forward mr-1.5"></i>Tiếp tục (' + done + '/' + total + ')');

      const el = document.createElement('div');
      el.className = 'glass-card rounded-3xl p-5 fade-in flex flex-col gap-3';
      el.innerHTML =
        '<div class="flex items-start justify-between gap-2">' +
          '<h4 class="font-bold text-gray-800 text-base leading-snug font-display">' + esc(item.name || 'Checklist') + '</h4>' +
          '<div class="flex gap-1 shrink-0">' +
            '<button data-act="edit" class="w-8 h-8 rounded-full bg-purple-50 text-purple-400 hover:bg-purple-100 transition" title="Sửa"><i class="fas fa-pen text-xs pointer-events-none"></i></button>' +
            '<button data-act="del" class="w-8 h-8 rounded-full bg-pink-50 text-pink-400 hover:bg-pink-100 transition" title="Xóa"><i class="fas fa-trash text-xs pointer-events-none"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="text-xs text-gray-500"><i class="fas fa-list-check mr-1 text-pink-400"></i>' + total + ' bước' + (dateStr ? ' · ' + dateStr : '') + '</div>' +
        scoreHtml +
        '<div>' +
          '<div class="flex justify-between text-[11px] font-semibold text-gray-500 mb-1"><span>Tiến độ</span><span>' + (pct === 100 ? 'Hoàn thành 🎉' : pct + '%') + '</span></div>' +
          '<div class="h-2 rounded-full bg-pink-100 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<button data-act="run" class="btn-gradient w-full py-2.5 rounded-2xl font-semibold mt-auto">' + runLabel + '</button>';

      el.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if(act === 'run') location.href = 'checklist-run.html?id=' + item.id;
        else if(act === 'edit') openModal(item);
        else if(act === 'del'){
          if(confirm('Xóa checklist "' + (item.name || '') + '"?')){
            data = data.filter(d => d.id !== item.id);
            localStorage.removeItem('progress_' + item.id);
            localStorage.removeItem('checklist_score_' + item.id);
            save(); renderCards();
          }
        }
      });
      cards.appendChild(el);
    });
  }

  // ===== Modal tạo / sửa =====
  function openModal(item){
    editingId = item ? item.id : null;
    csvSteps = null;
    $('modalTitle').textContent = item ? 'Sửa checklist' : 'Tạo checklist';
    $('checklistName').value = item ? (item.name || '') : '';
    $('csvFile').value = '';
    $('csvStatus').textContent = '';
    const container = $('stepsContainer');
    container.innerHTML = '';
    (item?.steps || []).forEach(s => addStepRow(container, s));
    if(!item?.steps?.length) addStepRow(container);
    showManualPane();
    const m = $('modalChecklist');
    m.classList.remove('hidden'); m.classList.add('flex');
    setTimeout(() => $('checklistName').focus(), 50);
  }
  function closeModal(){
    const m = $('modalChecklist');
    m.classList.add('hidden'); m.classList.remove('flex');
  }
  function setTab(activeBtn, inactiveBtn){
    activeBtn.classList.add('bg-white', 'text-pink-500', 'shadow-sm');
    inactiveBtn.classList.remove('bg-white', 'text-pink-500', 'shadow-sm');
  }
  function showManualPane(){
    $('manualPane').classList.remove('hidden');
    $('csvPane').classList.add('hidden');
    setTab($('methodManual'), $('methodCsv'));
  }
  function showCsvPane(){
    $('manualPane').classList.add('hidden');
    $('csvPane').classList.remove('hidden');
    setTab($('methodCsv'), $('methodManual'));
  }

  function addStepRow(container, step){
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-start';
    row.innerHTML =
      '<span class="step-num w-7 h-9 flex items-center justify-center text-xs font-bold text-pink-400 shrink-0">' + (container.children.length + 1) + '</span>' +
      '<div class="flex-1 space-y-1.5">' +
        '<input type="text" placeholder="Nội dung bước" class="inp-content w-full px-3 py-2 rounded-xl border border-pink-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-pink-300/50 text-base">' +
        '<input type="text" placeholder="Ghi chú (không bắt buộc)" class="inp-note w-full px-3 py-1.5 rounded-xl border border-pink-50 bg-white/60 text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-200/50 text-base">' +
      '</div>' +
      '<button class="btn-del-row w-8 h-9 rounded-xl text-gray-300 hover:text-pink-500 hover:bg-pink-50 transition shrink-0" title="Xóa bước"><i class="fas fa-xmark pointer-events-none"></i></button>';
    row.querySelector('.inp-content').value = step?.content || '';
    row.querySelector('.inp-note').value = step?.note || '';
    row.dataset.stepLabel = step?.step || '';
    row.querySelector('.btn-del-row').addEventListener('click', () => { row.remove(); renumberRows(container); });
    container.appendChild(row);
  }
  function renumberRows(container){
    Array.from(container.querySelectorAll('.step-num')).forEach((el,i) => el.textContent = i + 1);
  }

  function collectSteps(){
    if(!$('csvPane').classList.contains('hidden') && csvSteps) return csvSteps;
    const steps = [];
    Array.from($('stepsContainer').children).forEach(row => {
      const content = row.querySelector('.inp-content').value.trim();
      const note = row.querySelector('.inp-note').value.trim();
      if(content) steps.push({ step: row.dataset.stepLabel || (steps.length + 1).toString(), content, note });
    });
    return steps;
  }

  function saveFromModal(){
    const name = $('checklistName').value.trim();
    if(!name){ $('checklistName').focus(); return alert('Nhập tên checklist đã nha') }
    const steps = collectSteps();
    if(!steps.length) return alert('Checklist cần ít nhất 1 bước');
    if(editingId){
      const node = data.find(n => n.id === editingId);
      if(node){ node.name = name; node.steps = steps; }
    }else{
      data.push({ id: uid(), type:'checklist', name, steps, createdAt: Date.now() });
    }
    save(); renderCards(); closeModal();
  }

  // ===== CSV =====
  function normalizeHeader(s){
    if(!s) return '';
    return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,'');
  }
  function parseCSV(text){
    text = text.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if(lines.length < 1) return [];
    const header = lines[0].split(',').map(normalizeHeader);
    const map = {};
    header.forEach((h,i) => map[h] = i);

    function lineToRow(line){
      const cols = []; let cur = ''; let inQuotes = false;
      for(let i = 0; i < line.length; i++){
        const ch = line[i];
        if(ch === '"'){ inQuotes = !inQuotes; continue }
        if(ch === ',' && !inQuotes){ cols.push(cur); cur = ''; } else cur += ch;
      }
      cols.push(cur);
      return cols.map(c => c.trim().replace(/^"|"$/g, ''));
    }

    const rows = [];
    for(let i = 1; i < lines.length; i++){
      const cols = lineToRow(lines[i]);
      const step = cols[map['buoc']] || '';
      const content = cols[map['noidungbuocdo']] || cols[map['noidung']] || cols[map['noidungbuoc']] || '';
      const note = cols[map['ghichu']] || '';
      if(!content && !step) continue;
      rows.push({ step: step || (rows.length + 1).toString(), content, note });
    }
    return rows;
  }

  // ===== Init =====
  function init(){
    load();
    renderCards();

    $('btnCreateChecklist').addEventListener('click', () => openModal());
    $('emptyCreateBtn').addEventListener('click', () => openModal());
    $('fabCreate').addEventListener('click', () => openModal());
    $('cancelChecklist').addEventListener('click', closeModal);
    $('closeChecklist').addEventListener('click', closeModal);
    $('modalChecklist').addEventListener('click', e => { if(e.target.id === 'modalChecklist') closeModal() });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('modalChecklist').classList.contains('hidden')) closeModal() });

    $('methodManual').addEventListener('click', showManualPane);
    $('methodCsv').addEventListener('click', showCsvPane);
    $('addStep').addEventListener('click', () => addStepRow($('stepsContainer')));
    $('saveChecklist').addEventListener('click', saveFromModal);
    $('searchInput').addEventListener('input', renderCards);

    $('csvFile').addEventListener('change', e => {
      const f = e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try{
          csvSteps = parseCSV(ev.target.result);
          $('csvStatus').textContent = csvSteps.length
            ? '✅ Đã đọc ' + csvSteps.length + ' bước từ file'
            : '⚠️ Không đọc được bước nào — kiểm tra lại tên cột nha';
        }catch(err){
          csvSteps = null;
          $('csvStatus').textContent = '❌ Lỗi khi đọc file: ' + err.message;
        }
      };
      reader.readAsText(f, 'utf-8');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
