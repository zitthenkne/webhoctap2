// Trang thực hiện checklist — 3 chế độ: tick list, học từng bước, kiểm tra chấm điểm (quẹt thẻ).
// Data: checklist_data_v1. Tiến độ tick: 'progress_'+id. Điểm: 'checklist_score_'+id = {last:{pct,pass,total,at}, best}.
(function(){
  const STORAGE_KEY = 'checklist_data_v1';
  const $ = id => document.getElementById(id);
  function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  let node = null;
  let prog = {};
  let presentIndex = 0;

  function loadNode(){
    let data = [];
    try{ data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }catch(e){}
    return data.find(x => x.id === id) || null;
  }
  function loadProgress(){ try{ return JSON.parse(localStorage.getItem('progress_' + id) || '{}') }catch(e){ return {} } }
  function saveProgress(){ localStorage.setItem('progress_' + id, JSON.stringify(prog)) }
  function loadScore(){ try{ return JSON.parse(localStorage.getItem('checklist_score_' + id) || 'null') }catch(e){ return null } }

  function doneCount(){
    const total = node.steps?.length || 0;
    let done = 0;
    for(let i = 0; i < total; i++) if(prog[i]) done++;
    return done;
  }

  function updateProgressUI(){
    const total = node.steps?.length || 0;
    const done = doneCount();
    const pct = total ? Math.round(done / total * 100) : 0;
    $('progressText').textContent = done + '/' + total + (pct === 100 ? ' 🎉' : '');
    $('progressBar').style.width = pct + '%';
  }

  function updateScoreChip(){
    const sc = loadScore();
    const chip = $('scoreChip');
    if(!sc){ chip.classList.add('hidden'); return }
    chip.classList.remove('hidden');
    chip.innerHTML = '<i class="fas fa-medal"></i> Điểm gần nhất ' + sc.last.pct + '% · Cao nhất ' + sc.best + '%';
  }

  function renderSteps(){
    const stepsEl = $('steps');
    stepsEl.innerHTML = '';
    (node.steps || []).forEach((s, idx) => {
      const label = document.createElement('label');
      label.className = 'step-item riso-card p-4 flex gap-3 items-start cursor-pointer transition fade-in' + (prog[idx] ? ' completed' : '');
      label.innerHTML =
        '<input type="checkbox" class="mt-1 w-5 h-5 accent-orange-600 shrink-0"' + (prog[idx] ? ' checked' : '') + '>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="text-[11px] font-mono font-bold text-orange-600 uppercase tracking-wide">Bước ' + esc(s.step || (idx + 1)) + '</div>' +
          '<div class="step-content font-bold text-stone-900 mt-0.5">' + esc(s.content || '') + '</div>' +
          (s.note ? '<div class="text-xs text-stone-600 mt-1 font-medium bg-amber-50/70 p-2 rounded-lg border border-amber-200/60"><i class="fas fa-note-sticky mr-1 text-amber-600"></i>' + esc(s.note) + '</div>' : '') +
        '</div>';
      label.querySelector('input').addEventListener('change', e => {
        prog[idx] = e.target.checked;
        label.classList.toggle('completed', e.target.checked);
        saveProgress(); updateProgressUI();
      });
      stepsEl.appendChild(label);
    });
    updateProgressUI();
  }

  // ===== Chế độ học từng bước =====
  function openPresenter(){
    const total = node.steps.length;
    presentIndex = 0;
    while(presentIndex < total - 1 && prog[presentIndex]) presentIndex++;
    $('present').classList.remove('hidden'); $('present').classList.add('flex');
    document.body.style.overflow = 'hidden';
    renderPresent();
  }
  function closePresenter(){
    $('present').classList.add('hidden'); $('present').classList.remove('flex');
    document.body.style.overflow = '';
    renderSteps();
  }
  function presenterOpen(){ return !$('present').classList.contains('hidden') }

  function renderPresent(){
    const total = node.steps.length;
    if(presentIndex >= total){
      $('presentCounter').textContent = 'Hoàn thành';
      $('presentBar').style.width = '100%';
      $('presentTitle').textContent = '';
      $('presentContent').textContent = '🎉 Đã xong toàn bộ checklist!';
      $('presentNote').textContent = 'Giỏi quá trời ✨';
      $('prevBtn').classList.remove('hidden');
      $('nextBtn').innerHTML = 'Đóng <i class="fas fa-check ml-1.5"></i>';
      return;
    }
    const s = node.steps[presentIndex];
    $('presentCounter').textContent = 'Bước ' + (presentIndex + 1) + '/' + total;
    $('presentBar').style.width = Math.round(presentIndex / total * 100) + '%';
    $('presentTitle').textContent = 'Bước ' + (s.step || (presentIndex + 1));
    $('presentContent').textContent = s.content || '';
    $('presentNote').textContent = s.note || '';
    $('prevBtn').classList.toggle('hidden', presentIndex === 0);
    $('nextBtn').innerHTML = 'Xong, tiếp <i class="fas fa-arrow-right ml-1.5"></i>';
  }

  function nextStep(){
    const total = node.steps.length;
    if(presentIndex >= total){ closePresenter(); return }
    prog[presentIndex] = true;
    saveProgress();
    presentIndex++;
    renderPresent();
  }
  function prevStep(){ if(presentIndex > 0){ presentIndex--; renderPresent(); } }

  // ===== Chế độ kiểm tra chấm điểm (quẹt thẻ) =====
  let gradeQueue = [];   // index các bước cần kiểm
  let gradePos = 0;
  let gradeResults = []; // {idx, pass}
  let gradeIsFullRun = true; // chỉ lưu điểm khi kiểm đủ toàn bộ bước
  let gradeAnimating = false;

  function gradeOpen(){ return !$('grade').classList.contains('hidden') && $('gradeResult').classList.contains('hidden') }

  function openGrade(queue){
    gradeQueue = queue || node.steps.map((_, i) => i);
    gradeIsFullRun = gradeQueue.length === node.steps.length;
    gradePos = 0;
    gradeResults = [];
    $('gradeRun').classList.remove('hidden');
    $('gradeResult').classList.add('hidden');
    $('grade').classList.remove('hidden'); $('grade').classList.add('flex');
    document.body.style.overflow = 'hidden';
    renderGradeCard();
  }
  function closeGrade(){
    $('grade').classList.add('hidden'); $('grade').classList.remove('flex');
    document.body.style.overflow = '';
    updateScoreChip();
  }

  function renderGradeCard(){
    const stack = $('gradeStack');
    stack.innerHTML = '';
    gradeAnimating = false;
    if(gradePos >= gradeQueue.length){ showGradeResult(); return }

    $('gradeCounter').textContent = (gradePos + 1) + '/' + gradeQueue.length;
    $('gradeBar').style.width = Math.round(gradePos / gradeQueue.length * 100) + '%';
    $('gradeUndo').style.visibility = gradePos > 0 ? 'visible' : 'hidden';

    // thẻ nền mờ phía sau cho có chiều sâu
    if(gradePos + 1 < gradeQueue.length){
      const behind = document.createElement('div');
      behind.className = 'absolute inset-0 glass-modal rounded-3xl scale-[.94] translate-y-3 opacity-60';
      stack.appendChild(behind);
    }

    const idx = gradeQueue[gradePos];
    const s = node.steps[idx];
    const card = document.createElement('div');
    card.className = 'grade-card absolute inset-0 glass-modal rounded-3xl p-6 flex flex-col items-center justify-center text-center overflow-y-auto';
    card.innerHTML =
      '<span class="stamp stamp-pass">THUỘC ✓</span>' +
      '<span class="stamp stamp-fail">CHƯA ✗</span>' +
      '<div class="text-xs font-mono font-bold text-orange-600 uppercase tracking-wide">Bước ' + esc(s.step || (idx + 1)) + '</div>' +
      '<div class="text-lg sm:text-xl font-bold text-gray-800 mt-2 font-display leading-snug">' + esc(s.content || '') + '</div>' +
      (s.note ? '<div class="text-xs text-stone-600 mt-3 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200"><i class="fas fa-note-sticky mr-1 text-amber-600"></i>' + esc(s.note) + '</div>' : '');
    stack.appendChild(card);
    attachSwipe(card);
  }

  function attachSwipe(card){
    let startX = 0, dx = 0, dragging = false;
    const passStamp = card.querySelector('.stamp-pass');
    const failStamp = card.querySelector('.stamp-fail');

    card.addEventListener('pointerdown', e => {
      if(gradeAnimating) return;
      dragging = true; dx = 0; startX = e.clientX;
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', e => {
      if(!dragging) return;
      dx = e.clientX - startX;
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
      passStamp.style.opacity = Math.min(1, Math.max(0, dx / 90));
      failStamp.style.opacity = Math.min(1, Math.max(0, -dx / 90));
    });
    function release(){
      if(!dragging) return;
      dragging = false;
      if(dx > 90) answer(true);
      else if(dx < -90) answer(false);
      else{
        card.style.transition = 'transform .25s cubic-bezier(.34,1.56,.64,1)';
        card.style.transform = '';
        passStamp.style.opacity = 0; failStamp.style.opacity = 0;
      }
    }
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
  }

  function answer(pass){
    if(gradeAnimating || gradePos >= gradeQueue.length) return;
    gradeAnimating = true;
    const card = $('gradeStack').querySelector('.grade-card');
    if(card){
      card.querySelector(pass ? '.stamp-pass' : '.stamp-fail').style.opacity = 1;
      card.style.transition = 'transform .3s ease-in, opacity .3s';
      card.style.transform = 'translateX(' + (pass ? '' : '-') + '130%) rotate(' + (pass ? 14 : -14) + 'deg)';
      card.style.opacity = '0';
    }
    gradeResults.push({ idx: gradeQueue[gradePos], pass });
    gradePos++;
    setTimeout(renderGradeCard, 280);
  }

  function undoGrade(){
    if(gradeAnimating || gradePos === 0) return;
    gradePos--;
    gradeResults.pop();
    renderGradeCard();
  }

  function showGradeResult(){
    const total = gradeResults.length;
    const pass = gradeResults.filter(r => r.pass).length;
    const pct = total ? Math.round(pass / total * 100) : 0;
    const failed = gradeResults.filter(r => !r.pass).map(r => r.idx);

    // lưu điểm (chỉ khi kiểm đủ toàn bộ)
    if(gradeIsFullRun && total > 0){
      const old = loadScore();
      const sc = { last: { pct, pass, total, at: Date.now() }, best: Math.max(pct, old?.best || 0) };
      localStorage.setItem('checklist_score_' + id, JSON.stringify(sc));
    }

    $('resultEmoji').textContent = pct >= 90 ? '🌟' : pct >= 70 ? '💖' : pct >= 50 ? '💪' : '🥺';
    $('resultPct').textContent = pct + '%';
    $('resultDetail').textContent = 'Thuộc ' + pass + '/' + total + ' bước' + (gradeIsFullRun ? '' : ' (ôn lại)');
    $('resultMsg').textContent = pct >= 90 ? 'Xuất sắc luôn!' : pct >= 70 ? 'Tốt lắm, gần thuộc hết rồi!' : pct >= 50 ? 'Ổn nè, ôn thêm xíu nữa nha' : 'Chưa sao, học lại rồi kiểm tra tiếp nha';

    const failedEl = $('resultFailed');
    if(failed.length){
      failedEl.innerHTML =
        '<div class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Bước chưa thuộc</div>' +
        failed.map(i => {
          const s = node.steps[i];
          return '<div class="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 mb-1.5">' +
            '<span class="text-[11px] font-bold text-rose-400 uppercase">Bước ' + esc(s.step || (i + 1)) + '</span>' +
            '<div class="text-sm font-semibold text-gray-700">' + esc(s.content || '') + '</div></div>';
        }).join('');
    }else{
      failedEl.innerHTML = '';
    }
    $('retryFailedBtn').classList.toggle('hidden', !failed.length);
    $('retryFailedBtn').onclick = () => openGrade(failed);

    $('gradeRun').classList.add('hidden');
    $('gradeResult').classList.remove('hidden');
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    node = loadNode();
    if(!node){
      $('title').textContent = 'Checklist không tồn tại';
      $('meta').textContent = 'Có thể đã bị xóa. Quay về thư viện nha 🥺';
      $('startBtn').disabled = true; $('gradeBtn').disabled = true; $('resetBtn').disabled = true;
      return;
    }
    prog = loadProgress();
    document.title = (node.name || 'Checklist') + ' 🎀 - Zitthenkne';
    $('title').textContent = node.name || 'Checklist';
    $('meta').textContent = (node.steps?.length || 0) + ' bước' + (node.createdAt ? ' · tạo ngày ' + new Date(node.createdAt).toLocaleDateString('vi-VN') : '');
    updateScoreChip();
    renderSteps();

    $('startBtn').addEventListener('click', () => {
      if(!(node.steps || []).length) return alert('Checklist rỗng');
      openPresenter();
    });
    $('gradeBtn').addEventListener('click', () => {
      if(!(node.steps || []).length) return alert('Checklist rỗng');
      openGrade();
    });
    $('resetBtn').addEventListener('click', () => {
      if(!confirm('Xóa tiến độ tick, làm lại từ đầu?')) return;
      prog = {};
      localStorage.removeItem('progress_' + id);
      renderSteps();
    });

    // học từng bước
    $('nextBtn').addEventListener('click', nextStep);
    $('prevBtn').addEventListener('click', prevStep);
    $('exitBtn').addEventListener('click', closePresenter);
    $('present').addEventListener('click', e => { if(e.target.id === 'present') closePresenter() });

    // kiểm tra
    $('gradePass').addEventListener('click', () => answer(true));
    $('gradeFail').addEventListener('click', () => answer(false));
    $('gradeUndo').addEventListener('click', undoGrade);
    $('gradeExit').addEventListener('click', closeGrade);
    $('resultCloseBtn').addEventListener('click', closeGrade);
    $('retryAllBtn').addEventListener('click', () => openGrade());

    document.addEventListener('keydown', e => {
      if(presenterOpen()){
        if(e.code === 'Space' || e.code === 'ArrowRight'){ e.preventDefault(); nextStep(); }
        else if(e.code === 'ArrowLeft') prevStep();
        else if(e.code === 'Escape') closePresenter();
      }else if(gradeOpen()){
        if(e.code === 'ArrowRight'){ e.preventDefault(); answer(true); }
        else if(e.code === 'ArrowLeft'){ e.preventDefault(); answer(false); }
        else if(e.code === 'Backspace'){ e.preventDefault(); undoGrade(); }
        else if(e.code === 'Escape') closeGrade();
      }else if(!$('grade').classList.contains('hidden') && e.code === 'Escape'){
        closeGrade(); // đang ở màn kết quả
      }
    });
  });
})();
