// ==========================================================================
// CLINICAL CHECKLIST V4 — JAVASCRIPT ENGINE (RISO PRINT STUDIO)
// Data Key: checklist_data_v1
// Node Schema: { id, type:'checklist', name, category, targetTime, steps:[{step,content,note,critical}], createdAt, isPinned }
// Progress: progress_<id>
// Score: checklist_score_<id> = { last: { pct, pass, total, at }, best }
// ==========================================================================

(function(){
  const STORAGE_KEY = 'checklist_data_v1';
  let data = [];
  let currentCategory = 'all';
  let editingId = null;
  let csvSteps = null;
  let lastDeletedItem = null;
  let undoTimeout = null;

  const $ = id => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML };

  // ==========================================================================
  // 1. KHO MẪU OSCE CHUẨN ĐHYD TP.HCM (BUILT-IN PRESETS)
  // ==========================================================================
  const OSCE_PRESETS = [
    {
      id: 'osce_cardio_ump',
      type: 'checklist',
      name: 'Khám Tim Mạch Toàn Diện Chuẩn OSCE',
      category: 'cardiology',
      targetTime: 6,
      isPinned: true,
      createdAt: Date.now() - 86400000 * 3,
      steps: [
        { step: '1', content: 'Chào hỏi, giải thích mục đích và bộc lộ lồng ngực đúng cách', note: 'Bệnh nhân nằm ngửa 30-45 độ', critical: false },
        { step: '2', content: 'Quan sát lồng ngực: tìm sẹo mổ tim, ổ đập bất thường, tuần hoàn bàng hệ', note: 'Quan sát từ góc nghiêng và chính diện', critical: false },
        { step: '3', content: 'Sờ mỏm tim: xác định vị trí, diện đập và biên độ', note: 'Bình thường liên sườn 4-5 đường trung đòn trái, diện đập < 2cm', critical: true },
        { step: '4', content: 'Sờ tìm dấu nảy trước ngực (Dấu Harzer) và rung miêu (Thrill)', note: 'Đặt lòng bàn tay hoặc gốc bàn tay vào các ổ van tim', critical: true },
        { step: '5', content: 'Nghe tim tại 5 ổ van: Van 2 lá (mỏm), Van 3 lá, Van ĐMC 1 & 2 (Erb), Van ĐMP', note: 'Dùng cả màng và chuông ống nghe', critical: true },
        { step: '6', content: 'Đánh giá: Tần số tim, nhịp đều/không đều, T1, T2, âm thổi tâm thu/tâm trương', note: 'Bắt mạch quay đồng thời khi nghe tim', critical: true },
        { step: '7', content: 'Khám tĩnh mạch cổ nổi (JVP) và phản hồi gan - tĩnh mạch cổ', note: 'Đầu nghiêng trái 45 độ, ấn bờ dưới sườn phải', critical: false },
        { step: '8', content: 'Thông báo kết thúc, hỗ trợ bệnh nhân mặc áo và cảm ơn', note: 'Tác phong chuẩn mực, y đức', critical: false }
      ]
    },
    {
      id: 'osce_pulmo_ump',
      type: 'checklist',
      name: 'Khám Hô Hấp & Phổi (Nhìn - Sờ - Gõ - Nghe)',
      category: 'pulmonology',
      targetTime: 6,
      isPinned: false,
      createdAt: Date.now() - 86400000 * 2,
      steps: [
        { step: '1', content: 'Chào hỏi, giải thích và bộc lộ lồng ngực bệnh nhân', note: 'Bệnh nhân ngồi thả lỏng', critical: false },
        { step: '2', content: 'Nhìn: Hình dạng lồng ngực, tần số thở, kiểu thở, co kéo cơ hô hấp phụ', note: 'Đếm nhịp thở kín đáo trong 30-60 giây', critical: false },
        { step: '3', content: 'Sờ: Tìm điểm đau thành ngực, độ giãn nở lồng ngực (nghiệm pháp vòm ngực)', note: 'Hai bàn tay ôm lồng ngực, ngón cái áp sát đường giữa', critical: false },
        { step: '4', content: 'Sờ rung thanh: đối xứng 2 bên từ trên xuống dưới', note: 'Bảo bệnh nhân đếm "Một - Hai - Ba"', critical: true },
        { step: '5', content: 'Gõ phổi: so sánh đối xứng 2 bên theo đường ziczac', note: 'Gõ ngón trên ngón tại các khoảng liên sườn, tránh gõ vào xương', critical: true },
        { step: '6', content: 'Nghe phổi: đánh giá rì rào phế nang và tiếng ran bất thường', note: 'Nghe đủ 1 chu kỳ hô hấp (hít vào - thở ra) tại mỗi vị trí', critical: true },
        { step: '7', content: 'Kết luận tổn thương: Hội chứng đông đặc / 3 giảm / Tràn khí / Tràn dịch', note: 'Tóm tắt các triệu chứng thực thể chính', critical: true },
        { step: '8', content: 'Giúp bệnh nhân mặc lại trang phục và cảm ơn', note: 'Hoàn tất trạm khám', critical: false }
      ]
    },
    {
      id: 'osce_gastro_ump',
      type: 'checklist',
      name: 'Khám Bụng & Phân Vùng 9 Vùng Chuẩn OSCE',
      category: 'gastro',
      targetTime: 6,
      isPinned: false,
      createdAt: Date.now() - 86400000 * 1,
      steps: [
        { step: '1', content: 'Tư thế bệnh nhân: Nằm ngửa, gối gấp nhẹ, 2 tay buông xuôi', note: 'Bộc lộ từ mũi ức đến khớp mu', critical: false },
        { step: '2', content: 'Nhìn bụng: Cân đối, di động theo nhịp thở, sẹo mổ cũ, tuần hoàn bàng hệ', note: 'Quan sát tiếp tuyến với thành bụng', critical: false },
        { step: '3', content: 'Nghe nhu động ruột trước khi sờ (2-3 phút)', note: 'Bình thường 5-30 lần/phút ở hố chậu phải', critical: true },
        { step: '4', content: 'Sờ nông: Tìm phản ứng thành bụng và vùng tăng cảm giác da', note: 'Sờ từ vùng không đau đến vùng đau', critical: true },
        { step: '5', content: 'Sờ sâu: Khám gan (móc gan), khám lách và các điểm đau ngoại khoa', note: 'Điểm McBurney, Điểm túi mật Murphy, Điểm niệu quản', critical: true },
        { step: '6', content: 'Khám thận: Dấu hiệu chạm thận và bập bềnh thận', note: 'Tay dưới nâng hố thắt lưng, tay trên ấn xuống', critical: false },
        { step: '7', content: 'Gõ bụng: Xác định diện đục của gan, diện đục vùng thấp (dịch màng bụng)', note: 'Gõ hình nan hoa từ rốn ra xung quanh', critical: true },
        { step: '8', content: 'Tóm tắt hội chứng bụng ngoại khoa / nội khoa và kết thúc', note: 'Báo cáo giám thị', critical: false }
      ]
    },
    {
      id: 'osce_scrubbing_ump',
      type: 'checklist',
      name: 'Rửa Tay Ngoại Khoa & Mang Găng Vô Khuẩn',
      category: 'procedure',
      targetTime: 5,
      isPinned: false,
      createdAt: Date.now() - 86400000 * 4,
      steps: [
        { step: '1', content: 'Chuẩn bị: Tháo trang sức, cắt móng tay, mang nón và khẩu trang y tế', note: 'Không để tóc lọt ra ngoài nón', critical: false },
        { step: '2', content: 'Rửa tay thường quy 1 phút mở đầu dưới vòi nước vô khuẩn', note: 'Dùng dung dịch xà phòng sát khuẩn', critical: false },
        { step: '3', content: 'Rửa tay ngoại khoa từng bước: Kẽ ngón, mu bàn tay, lòng bàn tay, cẳng tay', note: 'Rửa lên đến trên khuỷu tay 5cm', critical: true },
        { step: '4', content: 'Tư thế bàn tay luôn cao hơn khuỷu tay trong suốt quá trình rửa và xả nước', note: 'Tránh nước từ khuỷu tay chảy ngược xuống bàn tay', critical: true },
        { step: '5', content: 'Lau khô tay bằng khăn vô khuẩn theo nguyên tắc từ ngón tay xuống khuỷu tay', note: 'Mỗi tay dùng 1 nửa khăn hoặc 2 khăn riêng', critical: true },
        { step: '6', content: 'Mặc áo mổ vô khuẩn: Chỉ chạm vào mặt trong của áo', note: 'Nhờ điều dưỡng vòng ngoài buộc dây áo sau lưng', critical: true },
        { step: '7', content: 'Mang găng tay phẫu thuật vô khuẩn theo kỹ thuật kín hoặc hở', note: 'Bảo đảm mặt ngoài găng hoàn toàn vô khuẩn', critical: true }
      ]
    },
    {
      id: 'osce_bls_ump',
      type: 'checklist',
      name: 'Hồi Sinh Tim Phổi Cơ Bản (BLS / C-A-B)',
      category: 'emergency',
      targetTime: 5,
      isPinned: true,
      createdAt: Date.now() - 86400000 * 5,
      steps: [
        { step: '1', content: 'Đánh giá an toàn hiện trường (Hiện trường an toàn cho người cấp cứu)', note: 'Yếu tố tiên quyết', critical: true },
        { step: '2', content: 'Kiểm tra đáp ứng nạn nhân (Lay vai, gọi to) & Gọi hỗ trợ 115', note: 'Kêu gọi người xung quanh lấy máy khử rung AED', critical: false },
        { step: '3', content: 'Kiểm tra mạch cảnh và nhịp thở đồng thời trong 5-10 giây', note: 'Không quá 10 giây', critical: true },
        { step: '4', content: 'Ép tim ngoài lồng ngực (C): Vị trí 1/2 dưới xương ức, tần số 100-120 l/p', note: 'Độ sâu 5-6 cm, để ngực nở hoàn toàn sau mỗi nhịp ép', critical: true },
        { step: '5', content: 'Khai thông đường thở (A): Nghiêng đầu - Nâng cằm (Head-tilt Chin-lift)', note: 'Tránh ngửa đầu nếu nghi ngờ chấn thương cột sống cổ (dùng Jaw-thrust)', critical: true },
        { step: '6', content: 'Thổi ngạt (B): 2 lần thổi hiệu quả làm ngực phồng lên', note: 'Tỷ lệ 30 lần ép tim : 2 lần thổi ngạt (Chu kỳ 30:2)', critical: true },
        { step: '7', content: 'Sử dụng máy phá rung tự động (AED) ngay khi có máy', note: 'Làm theo hướng dẫn giọng nói của máy AED', critical: true }
      ]
    }
  ];

  // ==========================================================================
  // 2. STORAGE & DATA MIGRATION
  // ==========================================================================
  function loadData(){
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if(stored){
        data = JSON.parse(stored);
      } else {
        data = [...OSCE_PRESETS];
        saveData();
      }
    } catch(e) {
      data = [...OSCE_PRESETS];
    }

    data = data.map(item => ({
      ...item,
      category: item.category || 'general',
      targetTime: item.targetTime || 6,
      isPinned: !!item.isPinned,
      createdAt: item.createdAt || Date.now()
    }));
  }

  function saveData(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function progressOf(item){
    let prog = {};
    try { prog = JSON.parse(localStorage.getItem('progress_' + item.id) || '{}'); } catch(e){}
    const total = item.steps?.length || 0;
    let done = 0;
    for(let i = 0; i < total; i++) if(prog[i]) done++;
    return { done, total };
  }

  function getCategoryMeta(cat){
    switch(cat){
      case 'cardiology': return { label: '🫀 Tim mạch', stampClass: 'stamp-cardiology', tapeClass: 'washi-tape' };
      case 'pulmonology': return { label: '🫁 Hô hấp', stampClass: 'stamp-pulmonology', tapeClass: 'washi-tape washi-tape-cobalt' };
      case 'gastro': return { label: '🩺 Tiêu hóa', stampClass: 'stamp-gastro', tapeClass: 'washi-tape washi-tape-honey' };
      case 'neuro': return { label: '🧠 Thần kinh', stampClass: 'stamp-neuro', tapeClass: 'washi-tape' };
      case 'emergency': return { label: '⚡ Cấp cứu', stampClass: 'stamp-emergency', tapeClass: 'washi-tape' };
      case 'procedure': return { label: '🩹 Thủ thuật', stampClass: 'stamp-procedure', tapeClass: 'washi-tape washi-tape-mint' };
      default: return { label: '📋 Lâm sàng', stampClass: 'stamp-general', tapeClass: 'washi-tape washi-tape-honey' };
    }
  }

  // ==========================================================================
  // 3. STATS & ANALYTICS
  // ==========================================================================
  function updateStats(){
    const total = data.filter(n => n.type === 'checklist').length;
    let mastered = 0;
    let needRev = 0;

    data.forEach(item => {
      let sc = null;
      try { sc = JSON.parse(localStorage.getItem('checklist_score_' + item.id) || 'null'); } catch(e){}
      if(sc && sc.best >= 90){
        mastered++;
      } else {
        needRev++;
      }
    });

    $('statTotal').textContent = total;
    $('statMastered').textContent = mastered;
    $('statNeedRev').textContent = needRev;
  }

  // ==========================================================================
  // 4. RENDER RISO CARDS GRID
  // ==========================================================================
  function renderCards(){
    const cards = $('cards');
    const kw = ($('searchInput').value || '').trim().toLowerCase();
    
    $('searchClearBtn').classList.toggle('hidden', !kw);

    let lists = data.filter(n => n.type === 'checklist');

    if(currentCategory === 'pinned'){
      lists = lists.filter(n => n.isPinned);
    } else if(currentCategory !== 'all'){
      lists = lists.filter(n => (n.category || 'general') === currentCategory);
    }

    if(kw){
      lists = lists.filter(n => {
        const matchName = (n.name || '').toLowerCase().includes(kw);
        const matchCat = (n.category || '').toLowerCase().includes(kw);
        const matchStep = (n.steps || []).some(s => 
          (s.content || '').toLowerCase().includes(kw) || (s.note || '').toLowerCase().includes(kw)
        );
        return matchName || matchCat || matchStep;
      });
    }

    lists.sort((a,b) => {
      if(a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    cards.innerHTML = '';
    $('emptyState').classList.toggle('hidden', lists.length > 0);

    lists.forEach((item, index) => {
      const { done, total } = progressOf(item);
      const pct = total ? Math.round(done / total * 100) : 0;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : '';
      const catMeta = getCategoryMeta(item.category);
      
      let score = null;
      try { score = JSON.parse(localStorage.getItem('checklist_score_' + item.id) || 'null'); } catch(e){}

      let stampMarkup = '';
      if(score && score.best >= 90){
        stampMarkup = `<span class="rubber-stamp rubber-stamp-pass">THUỘC ✓ ${score.best}%</span>`;
      } else if(score){
        stampMarkup = `<span class="rubber-stamp rubber-stamp-warn">ĐIỂM: ${score.last.pct}%</span>`;
      }

      const runLabel = done === 0 
        ? `<i class="fas fa-play text-xs"></i> Thực hiện ngay`
        : (done >= total ? `<i class="fas fa-rotate-right text-xs"></i> Luyện lại từ đầu` : `<i class="fas fa-forward text-xs"></i> Tiếp tục (${done}/${total})`);

      const pinIconClass = item.isPinned ? 'fas fa-star text-amber-500' : 'far fa-star text-stone-400';

      const el = document.createElement('article');
      el.className = 'riso-card p-5 fade-in flex flex-col gap-3.5 relative pt-6';
      el.innerHTML = `
        <!-- Washi Tape Strip -->
        <div class="${catMeta.tapeClass}" aria-hidden="true"></div>

        <!-- Top Row: Category Stamp & Actions -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="stamp-badge ${catMeta.stampClass}">${catMeta.label}</span>
            <span class="px-2 py-0.5 rounded bg-stone-100 border border-stone-400 text-stone-700 text-[10px] font-mono font-bold">
              ⏱️ ${item.targetTime || 6}m
            </span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button data-act="pin" class="btn-icon-riso text-xs" title="${item.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}" aria-label="Ghim">
              <i class="${pinIconClass} pointer-events-none"></i>
            </button>
            <button data-act="dup" class="btn-icon-riso text-xs text-blue-700" title="Nhân bản quy trình" aria-label="Nhân bản">
              <i class="fas fa-copy pointer-events-none"></i>
            </button>
            <button data-act="edit" class="btn-icon-riso text-xs text-orange-600" title="Chỉnh sửa" aria-label="Chỉnh sửa">
              <i class="fas fa-pen-to-square pointer-events-none"></i>
            </button>
            <button data-act="del" class="btn-icon-riso text-xs text-red-600" title="Xóa" aria-label="Xóa">
              <i class="fas fa-trash-can pointer-events-none"></i>
            </button>
          </div>
        </div>

        <!-- Procedure Name -->
        <div>
          <h2 class="font-extrabold text-stone-900 text-base leading-snug font-display hover:text-orange-600 transition cursor-pointer" data-act="run">
            ${esc(item.name || 'Quy trình lâm sàng')}
          </h2>
          <div class="text-[11px] font-mono font-medium text-stone-500 mt-1 flex items-center gap-2">
            <span>№ ${total} BƯỚC</span>
            ${dateStr ? `<span>· NGÀY: ${dateStr}</span>` : ''}
          </div>
        </div>

        <!-- Stamped Evaluation Score -->
        <div class="flex items-center justify-between min-h-[26px]">
          ${stampMarkup ? stampMarkup : `<span class="text-[11px] text-stone-400 font-mono italic">Chưa kiểm tra quẹt thẻ</span>`}
          <span class="text-[11px] font-mono font-bold text-stone-700">${done}/${total} bước</span>
        </div>

        <!-- Mechanical Progress Bar -->
        <div class="space-y-1 mt-auto">
          <div class="h-2.5 rounded-full bg-stone-200 border border-stone-800 overflow-hidden">
            <div class="h-full bg-orange-500 transition-all duration-300" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- Run Action Button -->
        <button data-act="run" class="btn-riso-primary w-full py-2.5 text-xs sm:text-sm font-bold tracking-wide">
          ${runLabel}
        </button>
      `;

      el.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if(!act) return;

        if(act === 'run'){
          location.href = 'checklist-run.html?id=' + item.id;
        } else if(act === 'pin'){
          item.isPinned = !item.isPinned;
          saveData();
          renderCards();
        } else if(act === 'dup'){
          duplicateChecklist(item);
        } else if(act === 'edit'){
          openModal(item);
        } else if(act === 'del'){
          deleteWithUndo(item);
        }
      });

      cards.appendChild(el);
    });

    updateStats();
  }

  // ==========================================================================
  // 5. DUPLICATE & 5-SECOND UNDO DELETE
  // ==========================================================================
  function duplicateChecklist(item){
    const clone = {
      ...JSON.parse(JSON.stringify(item)),
      id: uid(),
      name: (item.name || 'Checklist') + ' (Bản sao)',
      createdAt: Date.now(),
      isPinned: false
    };
    data.unshift(clone);
    saveData();
    renderCards();
  }

  function deleteWithUndo(item){
    lastDeletedItem = item;
    data = data.filter(d => d.id !== item.id);
    saveData();
    renderCards();

    const toast = $('undoToast');
    $('undoToastText').textContent = `Đã xóa "${item.name || 'Checklist'}"`;
    toast.classList.remove('hidden');
    toast.classList.add('flex');

    if(undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      if(lastDeletedItem && lastDeletedItem.id === item.id){
        localStorage.removeItem('progress_' + item.id);
        localStorage.removeItem('checklist_score_' + item.id);
        lastDeletedItem = null;
      }
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, 5000);
  }

  function restoreDeleted(){
    if(!lastDeletedItem) return;
    data.unshift(lastDeletedItem);
    saveData();
    renderCards();

    lastDeletedItem = null;
    if(undoTimeout) clearTimeout(undoTimeout);
    $('undoToast').classList.add('hidden');
    $('undoToast').classList.remove('flex');
  }

  // ==========================================================================
  // 6. MODAL 1: TẠO / CHỈNH SỬA CHECKLIST
  // ==========================================================================
  function openModal(item){
    editingId = item ? item.id : null;
    csvSteps = null;

    $('modalTitle').innerHTML = item 
      ? `<i class="fas fa-pen-nib text-orange-600"></i> <span>Sửa Checklist</span>` 
      : `<i class="fas fa-plus text-orange-600"></i> <span>Tạo Checklist Mới</span>`;
    
    $('checklistName').value = item ? (item.name || '') : '';
    $('checklistCategory').value = item ? (item.category || 'general') : 'general';
    $('checklistTargetTime').value = item ? (item.targetTime || 6) : 6;
    $('csvFile').value = '';
    $('csvStatus').textContent = '';
    $('smartPasteInput').value = '';

    const container = $('stepsContainer');
    container.innerHTML = '';
    (item?.steps || []).forEach(s => addStepRow(container, s));
    if(!item?.steps?.length) addStepRow(container);

    showTab('manual');
    const m = $('modalChecklist');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => $('checklistName').focus(), 60);
  }

  function closeModal(){
    const m = $('modalChecklist');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }

  function showTab(type){
    $('manualPane').classList.toggle('hidden', type !== 'manual');
    $('smartPastePane').classList.toggle('hidden', type !== 'smart');
    $('csvPane').classList.toggle('hidden', type !== 'csv');

    const tabs = [
      { id: 'methodManual', active: type === 'manual' },
      { id: 'methodSmartPaste', active: type === 'smart' },
      { id: 'methodCsv', active: type === 'csv' }
    ];

    tabs.forEach(t => {
      const el = $(t.id);
      if(t.active){
        el.className = 'method-tab flex-1 py-1.5 rounded-lg font-bold text-xs bg-white text-stone-900 border border-stone-800 shadow-[1px_1px_0px_#18181B]';
      } else {
        el.className = 'method-tab flex-1 py-1.5 rounded-lg font-bold text-xs text-stone-600 hover:text-stone-900';
      }
    });
  }

  function addStepRow(container, step){
    const row = document.createElement('div');
    row.className = 'step-row flex gap-2 items-start p-2.5 bg-amber-50/40 rounded-xl border-2 border-stone-800 shadow-[2px_2px_0px_#18181B]';
    row.innerHTML = `
      <div class="flex flex-col items-center justify-center shrink-0 pt-1">
        <span class="step-num w-6 h-6 rounded-lg bg-stone-900 text-white flex items-center justify-center text-xs font-bold font-mono">
          ${container.children.length + 1}
        </span>
        <div class="flex flex-col gap-1 mt-1">
          <button type="button" class="btn-move-up text-[10px] text-stone-500 hover:text-stone-900" title="Di chuyển lên"><i class="fas fa-chevron-up"></i></button>
          <button type="button" class="btn-move-down text-[10px] text-stone-500 hover:text-stone-900" title="Di chuyển xuống"><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>
      <div class="flex-1 space-y-1.5 min-w-0">
        <input type="text" placeholder="Nội dung bước thực hiện *" class="inp-content w-full px-3 py-1.5 rounded-lg border-2 border-stone-800 bg-white text-sm font-semibold text-stone-900 focus:outline-none">
        <div class="flex gap-2 items-center">
          <input type="text" placeholder="Ghi chú kỹ thuật / Mẹo trạm (không bắt buộc)" class="inp-note flex-1 px-3 py-1 rounded-lg border border-stone-300 bg-white/90 text-xs text-stone-600 focus:outline-none">
          <label class="flex items-center gap-1 text-[11px] font-bold text-red-600 shrink-0 cursor-pointer select-none bg-red-50 px-2 py-0.5 rounded border border-red-200">
            <input type="checkbox" class="inp-critical accent-red-600 rounded">
            <span>Điểm liệt ⚠️</span>
          </label>
        </div>
      </div>
      <button type="button" class="btn-del-row w-7 h-7 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition shrink-0 flex items-center justify-center" title="Xóa bước">
        <i class="fas fa-xmark"></i>
      </button>
    `;

    row.querySelector('.inp-content').value = step?.content || '';
    row.querySelector('.inp-note').value = step?.note || '';
    row.querySelector('.inp-critical').checked = !!step?.critical;
    row.dataset.stepLabel = step?.step || '';

    row.querySelector('.btn-move-up').addEventListener('click', () => {
      const prev = row.previousElementSibling;
      if(prev){ container.insertBefore(row, prev); renumberRows(container); }
    });
    row.querySelector('.btn-move-down').addEventListener('click', () => {
      const next = row.nextElementSibling;
      if(next){ container.insertBefore(next, row); renumberRows(container); }
    });
    row.querySelector('.btn-del-row').addEventListener('click', () => {
      row.remove();
      renumberRows(container);
    });

    container.appendChild(row);
  }

  function renumberRows(container){
    Array.from(container.querySelectorAll('.step-num')).forEach((el, i) => el.textContent = i + 1);
  }

  function collectSteps(){
    if(!$('csvPane').classList.contains('hidden') && csvSteps) return csvSteps;
    const steps = [];
    Array.from($('stepsContainer').children).forEach((row, idx) => {
      const content = row.querySelector('.inp-content').value.trim();
      const note = row.querySelector('.inp-note').value.trim();
      const critical = row.querySelector('.inp-critical').checked;
      if(content){
        steps.push({
          step: row.dataset.stepLabel || (idx + 1).toString(),
          content,
          note,
          critical
        });
      }
    });
    return steps;
  }

  function saveFromModal(){
    const name = $('checklistName').value.trim();
    if(!name){ $('checklistName').focus(); return alert('Vui lòng nhập tên quy trình/kỹ năng nha ✨'); }
    
    const steps = collectSteps();
    if(!steps.length){ return alert('Checklist cần ít nhất 1 bước thực hiện'); }

    const category = $('checklistCategory').value || 'general';
    const targetTime = parseInt($('checklistTargetTime').value, 10) || 6;

    if(editingId){
      const node = data.find(n => n.id === editingId);
      if(node){
        node.name = name;
        node.category = category;
        node.targetTime = targetTime;
        node.steps = steps;
      }
    } else {
      data.unshift({
        id: uid(),
        type: 'checklist',
        name,
        category,
        targetTime,
        isPinned: false,
        steps,
        createdAt: Date.now()
      });
    }

    saveData();
    renderCards();
    closeModal();
  }

  // ==========================================================================
  // 7. SMART TEXT PARSER
  // ==========================================================================
  function parseSmartText(){
    const raw = $('smartPasteInput').value.trim();
    if(!raw) return alert('Dán văn bản các bước vào ô trước nha');

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const container = $('stepsContainer');
    container.innerHTML = '';

    lines.forEach(line => {
      const cleaned = line.replace(/^(\d+[\.\)\/]|bước\s*\d+[\:\.\-]?|[\-\*\+•])\s*/i, '').trim();
      if(cleaned){
        addStepRow(container, { content: cleaned, note: '', critical: false });
      }
    });

    showTab('manual');
  }

  // ==========================================================================
  // 8. CSV PARSER
  // ==========================================================================
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
        if(ch === '"'){ inQuotes = !inQuotes; continue; }
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
      rows.push({ step: step || (rows.length + 1).toString(), content, note, critical: false });
    }
    return rows;
  }

  // ==========================================================================
  // 9. MODAL 2: OSCE PRESETS HUB
  // ==========================================================================
  function renderPresetsModal(){
    const list = $('presetsList');
    list.innerHTML = '';

    OSCE_PRESETS.forEach(preset => {
      const catMeta = getCategoryMeta(preset.category);
      const card = document.createElement('div');
      card.className = 'p-3.5 bg-white rounded-xl border-2 border-stone-800 shadow-[2px_2px_0px_#18181B] flex items-center justify-between gap-3 hover:translate-x-0.5 transition';
      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="stamp-badge ${catMeta.stampClass}">${catMeta.label}</span>
            <span class="text-[10px] font-mono font-bold text-stone-500">${preset.steps.length} BƯỚC · ⏱️ ${preset.targetTime}m</span>
          </div>
          <h4 class="font-extrabold text-stone-900 text-sm truncate font-display">${esc(preset.name)}</h4>
        </div>
        <button data-id="${preset.id}" class="btn-add-preset btn-riso-secondary px-3 py-1.5 text-xs shrink-0 font-bold">
          <i class="fas fa-plus text-orange-600 mr-1"></i> Nạp
        </button>
      `;

      card.querySelector('.btn-add-preset').addEventListener('click', () => {
        addSinglePreset(preset);
      });

      list.appendChild(card);
    });
  }

  function addSinglePreset(preset){
    const exists = data.some(d => d.name === preset.name);
    const itemToAdd = {
      ...JSON.parse(JSON.stringify(preset)),
      id: uid(),
      name: exists ? preset.name + ' (Mới)' : preset.name,
      createdAt: Date.now()
    };
    data.unshift(itemToAdd);
    saveData();
    renderCards();
    alert(`Đã nạp quy trình "${preset.name}" vào sổ tay! 🏷️`);
  }

  function loadAllPresets(){
    OSCE_PRESETS.forEach(preset => {
      const exists = data.some(d => d.name === preset.name);
      if(!exists){
        data.unshift({
          ...JSON.parse(JSON.stringify(preset)),
          id: uid(),
          createdAt: Date.now()
        });
      }
    });
    saveData();
    renderCards();
    closePresetsModal();
    alert('Đã nạp toàn bộ 5 quy trình OSCE kinh điển vào sổ tay! 🏷️');
  }

  function openPresetsModal(){
    renderPresetsModal();
    $('modalPresets').classList.remove('hidden');
    $('modalPresets').classList.add('flex');
  }

  function closePresetsModal(){
    $('modalPresets').classList.add('hidden');
    $('modalPresets').classList.remove('flex');
  }

  // ==========================================================================
  // 10. MODAL 3: JSON BACKUP & SHARE
  // ==========================================================================
  function openBackupModal(){
    $('modalBackup').classList.remove('hidden');
    $('modalBackup').classList.add('flex');
  }

  function closeBackupModal(){
    $('modalBackup').classList.add('hidden');
    $('modalBackup').classList.remove('flex');
  }

  function exportJsonFile(){
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zitthenkne_checklists_riso_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJsonClipboard(){
    const jsonStr = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      alert('Đã sao chép chuỗi JSON vào Clipboard! 📋');
    }).catch(() => {
      alert('Không thể sao chép tự động, vui lòng dùng tính năng Tải file .json.');
    });
  }

  function importJsonData(){
    const raw = $('importJsonText').value.trim();
    if(!raw) return alert('Vui lòng dán chuỗi JSON hoặc chọn file trước');

    try {
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error('Dữ liệu JSON phải là một mảng danh sách checklist.');
      
      let added = 0;
      parsed.forEach(item => {
        if(item.type === 'checklist' && item.steps?.length){
          data.unshift({
            ...item,
            id: uid(),
            createdAt: Date.now()
          });
          added++;
        }
      });

      saveData();
      renderCards();
      closeBackupModal();
      alert(`Đã nạp thành công ${added} quy trình vào sổ tay! 🏷️`);
    } catch(err) {
      alert('Lỗi cú pháp JSON: ' + err.message);
    }
  }

  // ==========================================================================
  // 11. INITIALIZATION & EVENT LISTENERS
  // ==========================================================================
  function init(){
    loadData();
    renderCards();

    // Top action buttons
    $('btnCreateChecklist').addEventListener('click', () => openModal());
    $('fabCreate').addEventListener('click', () => openModal());
    $('emptyCreateBtn').addEventListener('click', () => openModal());
    $('btnPresets').addEventListener('click', openPresetsModal);
    $('emptyPresetBtn').addEventListener('click', openPresetsModal);
    $('btnBackup').addEventListener('click', openBackupModal);

    // Modal 1: Creator handlers
    $('cancelChecklist').addEventListener('click', closeModal);
    $('closeChecklist').addEventListener('click', closeModal);
    $('saveChecklist').addEventListener('click', saveFromModal);
    $('modalChecklist').addEventListener('click', e => { if(e.target.id === 'modalChecklist') closeModal(); });
    $('methodManual').addEventListener('click', () => showTab('manual'));
    $('methodSmartPaste').addEventListener('click', () => showTab('smart'));
    $('methodCsv').addEventListener('click', () => showTab('csv'));
    $('addStep').addEventListener('click', () => addStepRow($('stepsContainer')));
    $('btnParseSmartText').addEventListener('click', parseSmartText);

    // Modal 2: Presets handlers
    $('closePresets').addEventListener('click', closePresetsModal);
    $('modalPresets').addEventListener('click', e => { if(e.target.id === 'modalPresets') closePresetsModal(); });
    $('btnLoadAllPresets').addEventListener('click', loadAllPresets);

    // Modal 3: Backup handlers
    $('closeBackup').addEventListener('click', closeBackupModal);
    $('modalBackup').addEventListener('click', e => { if(e.target.id === 'modalBackup') closeBackupModal(); });
    $('btnExportJson').addEventListener('click', exportJsonFile);
    $('btnCopyJson').addEventListener('click', copyJsonClipboard);
    $('btnImportJson').addEventListener('click', importJsonData);

    $('importJsonFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        $('importJsonText').value = ev.target.result;
      };
      reader.readAsText(file, 'utf-8');
    });

    // CSV File Reader
    $('csvFile').addEventListener('change', e => {
      const f = e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          csvSteps = parseCSV(ev.target.result);
          $('csvStatus').textContent = csvSteps.length
            ? `✅ Đã đọc ${csvSteps.length} bước từ file CSV`
            : '⚠️ Không đọc được bước nào — kiểm tra lại tên cột (buoc, noidung, ghichu) nha';
        } catch(err) {
          csvSteps = null;
          $('csvStatus').textContent = '❌ Lỗi khi đọc file: ' + err.message;
        }
      };
      reader.readAsText(f, 'utf-8');
    });

    // Search & Clear
    $('searchInput').addEventListener('input', renderCards);
    $('searchClearBtn').addEventListener('click', () => {
      $('searchInput').value = '';
      renderCards();
      $('searchInput').focus();
    });

    // Specialty Filter Pills
    document.querySelectorAll('.filter-pill').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-selected', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        currentCategory = chip.dataset.category;
        renderCards();
      });
    });

    // Undo Toast Button
    $('btnUndoDelete').addEventListener('click', restoreDeleted);

    // Global Keydown (Escape)
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){
        if(!$('modalChecklist').classList.contains('hidden')) closeModal();
        if(!$('modalPresets').classList.contains('hidden')) closePresetsModal();
        if(!$('modalBackup').classList.contains('hidden')) closeBackupModal();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
