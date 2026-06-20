// Checklist management using localStorage. Data model: flat array of nodes with parentId. Node: {id,type:'folder'|'checklist',name,parentId,children? ,steps?}
(function(){
  const STORAGE_KEY = 'checklist_data_v1';
  let data = [];
  let csvSteps = null;

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8) }

  function load(){
    try{ data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }catch(e){ data = [] }
  }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }

  function getById(id){ return data.find(n=>n.id===id) }

  function renderCards(){
    const cards = document.getElementById('cards'); cards.innerHTML='';
    const lists = data.filter(n=>n.type==='checklist');
    if(lists.length===0){ cards.innerHTML='<p>Chưa có checklist nào.</p>'; return }
    lists.forEach(item=>{
      const el = document.createElement('div'); el.className='card';
      const title = document.createElement('h4'); title.textContent = item.name || 'Checklist';
      const meta = document.createElement('div'); meta.className='meta';
      meta.textContent = 'Bước: ' + (item.steps?.length||0);
      const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent='Thực hiện';
      btn.addEventListener('click', ()=>{ window.location.href = 'checklist-run.html?id='+item.id });

      const del = document.createElement('button'); del.className='btn'; del.textContent='Xóa'; del.addEventListener('click', ()=>{ if(confirm('Xóa checklist này?')){ data = data.filter(d=>d.id!==item.id); save(); renderCards(); } });

      el.appendChild(title); el.appendChild(meta); el.appendChild(document.createElement('div'));
      const spacer = document.createElement('div'); spacer.style.height='8px'; el.appendChild(spacer);
      const actions = document.createElement('div'); actions.className='actions'; actions.appendChild(btn); actions.appendChild(del); el.appendChild(actions);
      cards.appendChild(el);
    })
  }

  // Modal controls
  function showModal(id){ document.getElementById(id).style.display='flex' }
  function hideModal(id){ document.getElementById(id).style.display='none' }

  // Checklist creation
  function createChecklist(name, steps){
    const node = { id: uid(), type:'checklist', name: name || 'Checklist mới', steps: steps||[], createdAt: Date.now() };
    data.push(node); save(); renderCards();
  }

  // CSV parsing (simple)
  
  function parseCSV(text){
    // remove BOM
    text = text.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    if(lines.length<1) return [];
    const header = lines[0].split(',').map(h=>normalizeHeader(h));
    const map = {};
    header.forEach((h,i)=> map[h]=i);

    function lineToRow(line){
      // basic CSV splitter that respects quoted fields
      const cols = [];
      let cur = '';
      let inQuotes = false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(ch === '"'){
          inQuotes = !inQuotes;
          continue;
        }
        if(ch === ',' && !inQuotes){
          cols.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur);
      return cols.map(c=>c.trim().replace(/^"|"$/g, ''));
    }

    const rows = [];
    for(let i=1;i<lines.length;i++){
      const cols = lineToRow(lines[i]);
      const step = cols[ map['buoc'] ] || cols[ map['bước'] ] || cols[ map['b'] ] || '';
      const content = cols[ map['noidungbuocdo'] ] || cols[ map['noidung'] ] || cols[ map['noidungbuoc'] ] || cols[ map['noidungbuocdo'] ] || '';
      const note = cols[ map['ghichu'] ] || '';
      if(!content && !step) continue;
      rows.push({ step: step|| (rows.length+1).toString(), content: content, note: note });
    }
    return rows;
  }
  function normalizeHeader(s){
    if(!s) return '';
    return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,'');
  }

  // DOM helpers for manual steps
  function addStepRow(container, step){
    
    const idx = container.children.length+1;
    const row = document.createElement('div'); row.className='step-row';
    const inpStep = document.createElement('input'); inpStep.type='text'; inpStep.placeholder='Bước'; inpStep.value = step?.step || idx;
    const inpContent = document.createElement('input'); inpContent.type='text'; inpContent.placeholder='Nội dung bước'; inpContent.value = step?.content || '';
    const inpNote = document.createElement('input'); inpNote.type='text'; inpNote.placeholder='Ghi chú (không bắt buộc)'; inpNote.value = step?.note || '';
    const btnDel = document.createElement('button'); btnDel.className='btn'; btnDel.textContent='X'; btnDel.addEventListener('click', ()=>{ container.removeChild(row) });
    row.appendChild(inpStep); row.appendChild(inpContent); row.appendChild(inpNote); row.appendChild(btnDel);
    container.appendChild(row);
  }

  // Init UI and events
  function init(){
    load();
    renderCards();

    document.getElementById('btnCreateChecklist').addEventListener('click', ()=>{
      prepareChecklistModal(); showModal('modalChecklist');
    });
    document.getElementById('cancelChecklist').addEventListener('click', ()=> hideModal('modalChecklist'));
    document.getElementById('methodManual').addEventListener('click', ()=> showManualPane());
    document.getElementById('methodCsv').addEventListener('click', ()=> showCsvPane());
    document.getElementById('addStep').addEventListener('click', ()=> addStepRow(document.getElementById('stepsContainer')) );
    document.getElementById('saveChecklist').addEventListener('click', ()=>{
      const name = document.getElementById('checklistName').value.trim() || 'Checklist mới';
      let steps = [];
      if(document.getElementById('manualPane').style.display !== 'none'){
        const rows = Array.from(document.getElementById('stepsContainer').children);
        rows.forEach(r=>{
          const inputs = r.querySelectorAll('input');
          const s = inputs[0].value.trim();
          const content = inputs[1].value.trim();
          const note = inputs[2].value.trim();
          if(content) steps.push({step:s|| (steps.length+1).toString(), content:content, note:note});
        })
      }else{
        // csvPane
        if(csvSteps) steps = csvSteps;
      }
      createChecklist(name, steps); hideModal('modalChecklist');
    });

    // inline save inside manual pane
    const inlineSave = document.getElementById('saveChecklistInline');
    if(inlineSave){ inlineSave.addEventListener('click', ()=>{ document.getElementById('saveChecklist').click(); }); }

    document.getElementById('csvFile').addEventListener('change', (e)=>{
      const f = e.target.files[0]; if(!f) return; const reader = new FileReader();
      reader.onload = function(ev){
        try{ csvSteps = parseCSV(ev.target.result); alert('Đã đọc ' + csvSteps.length + ' bước từ file'); }
        catch(err){ alert('Lỗi khi đọc file: '+err.message) }
      };
      reader.readAsText(f, 'utf-8');
    });
  }

  function prepareChecklistModal(){
    document.getElementById('checklistName').value='';
    document.getElementById('manualPane').style.display='none';
    document.getElementById('csvPane').style.display='none';
    document.getElementById('stepsContainer').innerHTML='';
    csvSteps = null;
  }
  function showManualPane(){
    document.getElementById('manualPane').style.display='block';
    document.getElementById('csvPane').style.display='none';
    // add one step by default
    const container = document.getElementById('stepsContainer'); container.innerHTML=''; addStepRow(container);
  }
  function showCsvPane(){
    document.getElementById('manualPane').style.display='none';
    document.getElementById('csvPane').style.display='block';
  }
  // bootstrap
  document.addEventListener('DOMContentLoaded', init);
})();