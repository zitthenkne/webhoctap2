(function(){
  const STORAGE_KEY = 'checklist_data_v1';
  function q(s){return document.querySelector(s)}
  function loadData(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]') }catch(e){ return [] } }
  function getById(arr,id){ return arr.find(x=>x.id===id) }
  function saveProgress(checklistId, progress){ localStorage.setItem('progress_'+checklistId, JSON.stringify(progress)) }
  function loadProgress(checklistId){ try{ return JSON.parse(localStorage.getItem('progress_'+checklistId)||'{}') }catch(e){ return {} } }

  let currentNode = null;
  let presentIndex = 0;

  function renderListView(){
    const params = new URLSearchParams(location.search); const id = params.get('id');
    const data = loadData(); currentNode = getById(data,id);
    if(!currentNode){ q('#title').textContent='Checklist không tồn tại'; return }
    q('#title').textContent = currentNode.name || 'Checklist';
    q('#meta').textContent = 'Số bước: ' + (currentNode.steps?.length||0);
    const stepsEl = q('#steps'); stepsEl.innerHTML='';
    const prog = loadProgress(id);
    (currentNode.steps||[]).forEach((s,idx)=>{
      const div = document.createElement('div'); div.className='list-step' + (prog[idx]? ' completed':'');
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!prog[idx];
      chk.addEventListener('change', ()=>{ prog[idx] = chk.checked; if(chk.checked) div.classList.add('completed'); else div.classList.remove('completed'); saveProgress(id, prog); });
      const label = document.createElement('div'); label.innerHTML = '<strong>Bước '+ (s.step || (idx+1)) +'</strong><div>'+ (s.content||'') +'</div>' + (s.note? '<div style="color:#666;font-size:13px">Ghi chú: '+s.note+'</div>':'');
      div.appendChild(chk); div.appendChild(label); stepsEl.appendChild(div);
    })

    // start button
    q('#startBtn').addEventListener('click', ()=>{ if(!(currentNode.steps||[]).length){ alert('Checklist rỗng'); return } presentIndex = 0; openPresenter(); renderPresent(); });
  }

  function openPresenter(){ q('#present').style.display='flex'; document.body.style.overflow='hidden'; }
  function closePresenter(){ q('#present').style.display='none'; document.body.style.overflow='auto'; }

  function renderPresent(){
    const step = (currentNode.steps||[])[presentIndex];
    q('#presentTitle').textContent = 'Bước ' + (step.step || (presentIndex+1));
    q('#presentContent').textContent = step.content || '';
    q('#presentNote').textContent = step.note || '';
  }

  function nextStep(){ if(presentIndex < (currentNode.steps||[]).length -1){ presentIndex++; renderPresent(); } }
  function prevStep(){ if(presentIndex > 0){ presentIndex--; renderPresent(); } }

  document.addEventListener('DOMContentLoaded', ()=>{
    renderListView();
    // presenter controls
    q('#nextBtn').addEventListener('click', ()=> nextStep());
    q('#prevBtn').addEventListener('click', ()=> prevStep());
    q('#exitBtn').addEventListener('click', ()=> closePresenter());
    // keyboard
    document.addEventListener('keydown', (e)=>{
      if(q('#present').style.display === 'flex'){
        if(e.code === 'Space' || e.key === ' ' || e.code === 'ArrowRight') { e.preventDefault(); nextStep(); }
        else if(e.code === 'ArrowLeft') { prevStep(); }
        else if(e.code === 'Escape') { closePresenter(); }
      }
    });
    // allow click outside to close
    q('#present').addEventListener('click', (e)=>{ if(e.target.id === 'present') closePresenter(); });
  });

})();
