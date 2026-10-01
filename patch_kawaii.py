import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_html = r'''            <div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-8 pb-28 max-w-3xl mx-auto relative">
                <!-- Nền Caro Sổ Vở -->
                <div class="absolute inset-0 opacity-40 z-[-1]" style="background-image: linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px); background-size: 24px 24px; pointer-events: none; border-radius: 32px;"></div>

                <style id="gpa-premium-styles">
                    /* Premium Scrapbook UI Styles */
                    @import url('https://fonts.googleapis.com/css2?family=Mali:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

                    :root {
                        --kawaii-accent: #ff8fab;
                        --kawaii-accent-hover: #fb6f92;
                        --kawaii-surface: #ffffff;
                        --kawaii-bg: #fff0f3;
                        --kawaii-text: #4a4e69;
                        --kawaii-text-muted: #9a8c98;
                        --kawaii-border: #ffc2d1;
                        --kawaii-tape: rgba(255, 229, 217, 0.85);
                    }

                    #gpaCalculatorContent {
                        font-family: 'Plus Jakarta Sans', sans-serif;
                        color: var(--kawaii-text);
                    }

                    .font-handwriting {
                        font-family: 'Mali', cursive;
                    }

                    /* Khối giấy Note với đường chỉ may */
                    .gpa-card {
                        background: var(--kawaii-surface);
                        border: 2px solid var(--kawaii-border);
                        border-radius: 20px;
                        box-shadow: 4px 6px 0px rgba(255, 194, 209, 0.4);
                        position: relative;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        z-index: 1;
                    }
                    /* Đường may (Stitch) bên trong Card */
                    .gpa-card::before {
                        content: '';
                        position: absolute;
                        inset: 6px;
                        border: 1.5px dashed #ffb3c6;
                        border-radius: 14px;
                        pointer-events: none;
                        z-index: -1;
                    }
                    .gpa-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 6px 10px 0px rgba(255, 194, 209, 0.5);
                    }

                    /* Miếng băng keo trang trí (Washi Tape) */
                    .washi-tape {
                        position: absolute;
                        top: -12px;
                        left: 50%;
                        transform: translateX(-50%) rotate(-2deg);
                        width: 120px;
                        height: 28px;
                        background: var(--kawaii-tape);
                        backdrop-filter: blur(4px);
                        opacity: 0.9;
                        z-index: 2;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                        border-left: 2px px dotted rgba(0,0,0,0.1);
                        border-right: 2px dotted rgba(0,0,0,0.1);
                    }
                    .washi-tape-blue { background: rgba(186, 230, 253, 0.85); transform: translateX(-50%) rotate(3deg); }
                    .washi-tape-yellow { background: rgba(254, 240, 138, 0.85); transform: translateX(-50%) rotate(-1deg); }

                    /* Inputs - phong cách ô điền chữ */
                    .gpa-input {
                        background: #f8fafc;
                        border: 2px solid #e2e8f0;
                        border-radius: 16px;
                        color: var(--kawaii-text);
                        transition: all 0.2s ease;
                        font-family: 'Plus Jakarta Sans', sans-serif;
                    }
                    .gpa-input:focus {
                        background: #ffffff;
                        border-color: var(--kawaii-accent);
                        box-shadow: 0 0 0 4px rgba(255, 143, 171, 0.15);
                        outline: none;
                    }

                    /* Buttons */
                    .gpa-btn-primary {
                        background: var(--kawaii-accent);
                        color: white;
                        border-radius: 16px;
                        font-weight: 700;
                        border: 2px solid #fb6f92;
                        box-shadow: 0 4px 0 #fb6f92;
                        transition: all 0.1s ease;
                        font-family: 'Mali', cursive;
                        letter-spacing: 0.5px;
                    }
                    .gpa-btn-primary:active {
                        transform: translateY(4px);
                        box-shadow: 0 0 0 #fb6f92;
                    }

                    /* Chips */
                    .gpa-chip-btn {
                        background: white;
                        color: #64748b;
                        border: 2px dashed #cbd5e1;
                        border-radius: 12px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                    }
                    .gpa-chip-btn:hover {
                        border-color: var(--kawaii-accent);
                        color: var(--kawaii-accent-hover);
                        background: #fff0f3;
                    }
                    .gpa-chip-btn.active {
                        background: var(--kawaii-accent);
                        color: white;
                        border: 2px solid #fb6f92;
                    }

                    /* Target GPA Selector */
                    .target-gpa-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
                        gap: 12px;
                    }
                    .target-gpa-box {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 12px 8px;
                        border-radius: 16px;
                        border: 2px solid #ffc2d1;
                        background: #fff0f3;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        color: #4a4e69;
                    }
                    .target-gpa-box:hover {
                        border-color: var(--kawaii-accent);
                        transform: translateY(-2px);
                    }
                    .target-gpa-box.active {
                        border-color: #fb6f92;
                        background: var(--kawaii-accent);
                        color: white;
                        box-shadow: 3px 3px 0 #ffc2d1;
                    }
                    .target-gpa-box.active * { color: white; }
                    
                    /* Segmented Control (Toggle) */
                    .gpa-segmented-control {
                        display: inline-flex;
                        background: #f1f5f9;
                        padding: 6px;
                        border-radius: 20px;
                        border: 2px dashed #cbd5e1;
                    }
                    .gpa-segment {
                        padding: 6px 20px;
                        border-radius: 14px;
                        font-size: 14px;
                        font-weight: 700;
                        color: #64748b;
                        transition: all 0.2s ease;
                        font-family: 'Mali', cursive;
                    }
                    .gpa-segment.active {
                        background: #ffffff;
                        color: var(--kawaii-accent);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                        border: 1px solid #ffc2d1;
                    }

                    /* Steps (Cúc áo / Sticker) */
                    .gpa-step-indicator {
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: #ffc2d1;
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-family: 'Mali', cursive;
                        font-weight: 800;
                        font-size: 18px;
                        flex-shrink: 0;
                        border: 2px dashed white;
                        box-shadow: 0 0 0 2px #ffc2d1, 2px 4px 0 rgba(255, 194, 209, 0.4);
                    }
                    
                    /* Range Slider */
                    .gpa-range {
                        -webkit-appearance: none;
                        width: 100%;
                        height: 12px;
                        background: #fff0f3;
                        border: 2px dashed #ffc2d1;
                        border-radius: 8px;
                        outline: none;
                    }
                    .gpa-range::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: var(--kawaii-accent);
                        cursor: pointer;
                        border: 3px solid white;
                        box-shadow: 2px 2px 0 #ffc2d1;
                        transition: transform 0.1s;
                    }
                    .gpa-range::-webkit-slider-thumb:hover { transform: scale(1.1); }

                    /* Table */
                    .gpa-reference-table {
                        border-collapse: separate;
                        border-spacing: 0;
                        border-radius: 12px;
                        overflow: hidden;
                        border: 2px solid #e2e8f0;
                    }
                    .gpa-reference-table th {
                        background: #f8fafc;
                        color: #4a4e69;
                        font-family: 'Mali', cursive;
                        font-weight: 700;
                        padding: 12px;
                        border-bottom: 2px solid #e2e8f0;
                    }
                    .gpa-reference-table td {
                        padding: 12px;
                        font-size: 14px;
                        font-weight: 600;
                        border-bottom: 1px dashed #e2e8f0;
                        color: #4a4e69;
                    }
                </style>

                <!-- Header Section -->
                <div class="text-center mb-10 mt-4 relative z-10">
                    <div class="inline-block relative mb-4">
                        <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center rotate-6 border-4 border-dashed border-[#ffc2d1] shadow-lg">
                            <span class="text-4xl">🧸</span>
                        </div>
                        <div class="absolute -bottom-2 -right-4 w-12 h-12 bg-[#bae6fd] rounded-full shadow-sm flex items-center justify-center border-2 border-white rotate-[-12deg]">
                            <span class="text-sky-600 font-handwriting font-bold text-lg">A+</span>
                        </div>
                    </div>
                    <h2 class="text-4xl font-extrabold text-[#4a4e69] font-handwriting tracking-tight mb-2 relative inline-block">
                        Bảng Điểm GPA
                        <div class="absolute -bottom-2 left-0 w-full h-3 bg-[#ffc2d1]/40 -rotate-1 rounded-full z-[-1]"></div>
                    </h2>
                    <p class="text-[#9a8c98] font-medium text-sm mt-3 max-w-sm mx-auto bg-white/60 px-4 py-2 rounded-xl border border-white backdrop-blur-sm">Lên chiến lược lấy học bổng dễ thương nà 🎀</p>
                </div>

                <!-- Quick Conversion Card -->
                <section class="gpa-card p-6 sm:p-8 mb-10 mt-6 relative">
                    <div class="washi-tape washi-tape-blue"></div>
                    
                    <div class="flex items-center gap-4 mb-6 pt-2">
                        <div class="w-12 h-12 rounded-2xl bg-sky-100 text-sky-500 flex items-center justify-center text-xl shrink-0 border-2 border-sky-200">
                            <i class="fas fa-calculator"></i>
                        </div>
                        <div>
                            <h3 class="text-xl font-handwriting font-bold text-[#4a4e69]">Quy Đổi Nhanh Xíu</h3>
                            <p class="text-xs sm:text-sm text-[#9a8c98] mt-0.5 font-medium">Tính điểm hệ 10 và điểm chữ tức thì.</p>
                        </div>
                    </div>

                    <form id="gpa-form">
                        <div class="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                            <div class="w-full relative">
                                <label for="correct-answers" class="block text-sm font-handwriting font-bold text-[#4a4e69] mb-2 pl-2">Số câu đúng nà</label>
                                <input type="number" id="correct-answers" min="0" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-sky-500 text-center placeholder:text-slate-300"
                                    placeholder="35">
                                <div class="absolute top-10 right-3 text-sky-200 text-2xl rotate-12 pointer-events-none"><i class="fas fa-check"></i></div>
                            </div>
                            <div class="text-[#cbd5e1] text-4xl font-bold font-handwriting hidden sm:block mt-6">/</div>
                            <div class="w-full relative">
                                <label for="total-questions" class="block text-sm font-handwriting font-bold text-[#4a4e69] mb-2 pl-2">Tổng số câu thi</label>
                                <input type="number" id="total-questions" min="1" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-slate-600 text-center placeholder:text-slate-300"
                                    placeholder="50">
                                <div class="absolute top-10 right-3 text-slate-200 text-2xl -rotate-12 pointer-events-none"><i class="fas fa-file-lines"></i></div>
                            </div>
                        </div>
                        
                        <div id="total-quick-chips" class="flex flex-wrap items-center justify-center gap-2 mt-5">
                            <span class="text-xs font-handwriting font-bold text-[#ff8fab] mr-2">Gợi ý lẹ:</span>
                            <button type="button" data-total="30" class="gpa-chip-btn px-3 py-1.5 text-xs">30 câu</button>
                            <button type="button" data-total="40" class="gpa-chip-btn px-3 py-1.5 text-xs">40 câu</button>
                            <button type="button" data-total="50" class="gpa-chip-btn px-3 py-1.5 text-xs">50 câu</button>
                            <button type="button" data-total="60" class="gpa-chip-btn px-3 py-1.5 text-xs">60 câu</button>
                            <button type="button" data-total="100" class="gpa-chip-btn px-3 py-1.5 text-xs">100 câu</button>
                        </div>
                        
                        <button type="button" id="calculate-gpa-btn"
                            class="gpa-btn-primary w-full mt-6 py-4 text-[16px] flex items-center justify-center gap-2">
                            <i class="fas fa-wand-magic-sparkles"></i> Quy Đổi Điểm
                        </button>
                    </form>
                    
                    <div id="gpa-result-area" class="mt-6 hidden"></div>
                    
                    <details class="mt-6 group border-2 border-dashed border-[#e2e8f0] rounded-2xl overflow-hidden bg-white/50">
                        <summary class="cursor-pointer list-none flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                            <span class="text-sm font-handwriting font-bold text-[#4a4e69] flex items-center gap-2">
                                <i class="fas fa-table-list text-sky-400"></i> Bảng quy đổi chuẩn UMP nè
                            </span>
                            <i class="fas fa-chevron-down text-xs text-slate-400 transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div class="bg-white p-3 overflow-x-auto">
                            <table class="w-full text-center gpa-reference-table min-w-[300px]">
                                <thead>
                                    <tr>
                                        <th>Hệ 10</th>
                                        <th>Hệ 4</th>
                                        <th>Điểm Chữ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>9.5 – 10</td><td>4.0</td><td><span class="text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">A+</span></td></tr>
                                    <tr><td>8.5 – 9.4</td><td>4.0</td><td><span class="text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">A</span></td></tr>
                                    <tr><td>8.0 – 8.4</td><td>3.5</td><td><span class="text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">B+</span></td></tr>
                                    <tr><td>7.0 – 7.9</td><td>3.0</td><td><span class="text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">B</span></td></tr>
                                    <tr><td>6.5 – 6.9</td><td>2.5</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">C+</span></td></tr>
                                    <tr><td>5.5 – 6.4</td><td>2.0</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">C</span></td></tr>
                                    <tr><td>5.0 – 5.4</td><td>1.5</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">D+</span></td></tr>
                                    <tr><td>4.0 – 4.9</td><td>1.0</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">D</span></td></tr>
                                    <tr><td>&lt; 4.0</td><td>0.0</td><td><span class="text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">F</span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>

                <!-- Strategy Card -->
                <section id="required-correct-section" class="gpa-card p-6 sm:p-8 mb-10 mt-6 relative">
                    <div class="washi-tape washi-tape-yellow"></div>

                    <div class="flex items-center gap-4 mb-8 pt-2">
                        <div class="w-12 h-12 rounded-2xl bg-[#fff0f3] text-[#fb6f92] flex items-center justify-center text-xl shrink-0 border-2 border-[#ffc2d1]">
                            <i class="fas fa-bullseye"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-xl font-handwriting font-bold text-[#4a4e69]">Chiến Lược Môn Học</h3>
                            <p class="text-xs sm:text-sm text-[#9a8c98] mt-0.5 font-medium">Lên kế hoạch cày số câu đúng.</p>
                        </div>
                        <button type="button" id="reset-goal-btn"
                            class="w-10 h-10 flex items-center justify-center bg-white border-2 border-dashed border-slate-200 hover:border-[#fb6f92] hover:bg-[#fff0f3] text-slate-400 hover:text-[#fb6f92] rounded-xl transition-colors shrink-0"
                            title="Làm mới">
                            <i class="fas fa-eraser"></i>
                        </button>
                    </div>

                    <!-- Subjects List (Tabs) -->
                    <div class="mb-8 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60 backdrop-blur-sm relative overflow-hidden">
                        <div class="absolute -right-4 -top-4 text-6xl opacity-5 pointer-events-none">📚</div>
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-sm font-handwriting font-bold text-slate-600"><i class="fas fa-book-bookmark text-[#ff8fab] mr-1"></i> Môn học đang cày</span>
                            <div class="flex gap-1.5">
                                <button type="button" id="rename-subject-btn" class="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-sky-50 hover:text-sky-500 transition-colors shadow-sm" title="Đổi tên môn"><i class="fas fa-pen text-[10px]"></i></button>
                                <button type="button" id="delete-subject-btn" class="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-colors shadow-sm" title="Xoá môn"><i class="fas fa-trash-can text-[10px]"></i></button>
                            </div>
                        </div>
                        <div id="subject-chips" class="flex gap-2 overflow-x-auto pb-2 scrollbar-none relative z-10">
                            <!-- JS render chips here -->
                        </div>
                    </div>

                    <!-- Semester GPA Summary -->
                    <details id="semester-gpa" class="group mb-8 rounded-2xl border-2 border-dashed border-[#ffc2d1] bg-[#fff0f3]/50 overflow-hidden">
                        <summary class="cursor-pointer list-none flex items-center gap-3 p-4 select-none hover:bg-[#fff0f3] transition-colors relative">
                            <div class="w-10 h-10 rounded-full bg-white text-[#ff8fab] flex items-center justify-center shrink-0 border-2 border-[#ffc2d1] shadow-sm">
                                🏅
                            </div>
                            <div class="flex flex-col">
                                <span class="text-sm font-handwriting font-bold text-[#4a4e69]">Tổng kết học kỳ</span>
                                <span id="semester-gpa-sub" class="text-xs font-medium text-[#9a8c98] mt-0.5"></span>
                            </div>
                            <div class="ml-auto text-right">
                                <span id="semester-gpa-value" class="text-xl font-handwriting font-bold text-[#fb6f92]">—</span>
                            </div>
                            <i class="fas fa-chevron-down text-xs text-[#ff8fab] ml-2 transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div id="semester-gpa-body" class="p-4 pt-0 border-t border-dashed border-[#ffc2d1] mt-1">
                            <!-- JS render -->
                        </div>
                    </details>

                    <!-- Step 1 -->
                    <div class="flex gap-4 mb-8 relative">
                        <div class="gpa-step-indicator">1</div>
                        <div class="flex-1">
                            <h4 class="text-[15px] font-handwriting font-bold text-[#4a4e69] mb-3 mt-1">Chọn cấu trúc kỳ thi nghen</h4>
                            <select id="exam-type" class="gpa-input w-full px-4 py-3 text-sm font-bold text-slate-700 cursor-pointer">
                                <option value="pretest">Có Pre-test (10% - 20% - 70%)</option>
                                <option value="nopretest">Không Pre-test (30% - 70%)</option>
                                <option value="custom">Tùy chỉnh tỷ lệ (Tự nhập)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex gap-4 mb-8 relative">
                        <div class="gpa-step-indicator">2</div>
                        <div class="flex-1">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 mt-1 gap-3">
                                <h4 class="text-[15px] font-handwriting font-bold text-[#4a4e69]">Mục tiêu điểm số của bà</h4>
                                <div id="target-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-target-mode="gpa4" class="target-mode-btn gpa-segment active">Hệ 4</button>
                                    <button type="button" data-target-mode="score10" class="target-mode-btn gpa-segment">Hệ 10</button>
                                </div>
                            </div>
                            
                            <input type="hidden" id="desired-gpa-4" value="4.0">
                            
                            <!-- Hệ 10 Input -->
                            <div id="desired-10-wrap" class="hidden bg-slate-50/80 rounded-2xl p-5 border-2 border-dashed border-slate-200">
                                <div class="flex flex-col sm:flex-row items-center gap-5">
                                    <div class="flex items-center gap-3 w-full">
                                        <span class="text-sm font-handwriting font-bold text-slate-500 w-12">Điểm:</span>
                                        <input type="number" id="desired-score-10" min="0" max="10" step="0.1" inputmode="decimal" value="8.5"
                                            class="gpa-input w-20 px-2 py-2 text-center text-xl font-bold text-slate-800 font-handwriting">
                                    </div>
                                    <div class="w-full">
                                        <input type="range" id="desired-score-10-range" min="0" max="10" step="0.1" value="8.5"
                                            class="gpa-range">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Hệ 4 Grid -->
                            <div id="desired-gpa-chips" class="target-gpa-grid">
                                <button type="button" data-gpa="1.0" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">D</span><span class="text-[11px] font-medium opacity-70">1.0</span>
                                </button>
                                <button type="button" data-gpa="1.5" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">D+</span><span class="text-[11px] font-medium opacity-70">1.5</span>
                                </button>
                                <button type="button" data-gpa="2.0" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">C</span><span class="text-[11px] font-medium opacity-70">2.0</span>
                                </button>
                                <button type="button" data-gpa="2.5" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">C+</span><span class="text-[11px] font-medium opacity-70">2.5</span>
                                </button>
                                <button type="button" data-gpa="3.0" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">B</span><span class="text-[11px] font-medium opacity-70">3.0</span>
                                </button>
                                <button type="button" data-gpa="3.5" class="gpa-chip target-gpa-box">
                                    <span class="text-lg font-handwriting font-bold">B+</span><span class="text-[11px] font-medium opacity-70">3.5</span>
                                </button>
                                <button type="button" data-gpa="4.0" class="gpa-chip target-gpa-box active">
                                    <span class="text-lg font-handwriting font-bold">A</span><span class="text-[11px] font-medium opacity-70">4.0</span>
                                </button>
                            </div>
                            
                            <p id="desired-target-hint" class="text-[13px] font-medium text-slate-500 bg-white border-2 border-dashed border-slate-200 p-3 rounded-xl mt-4 hidden shadow-sm"></p>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex gap-4 mb-4 relative">
                        <div class="gpa-step-indicator">3</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                                <h4 class="text-[15px] font-handwriting font-bold text-[#4a4e69] mt-1">Ghi chú lại đợt thi nà</h4>
                                <div id="scale-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-mode="ump" class="scale-mode-btn gpa-segment active">Khung UMP</button>
                                    <button type="button" data-mode="linear" class="scale-mode-btn gpa-segment">% tuyến tính</button>
                                </div>
                            </div>

                            <div id="attempts-table" class="space-y-4">
                                <!-- JS render inputs -->
                            </div>
                        </div>
                    </div>

                    <div id="gpa-live-projection" class="hidden"></div>
                    
                    <!-- Sticky Mobile Bar -->
                    <div id="gpa-sticky-bar" class="hidden sm:hidden sticky bottom-[5rem] z-20 mb-4 px-2">
                        <button type="button" id="gpa-sticky-btn"
                            class="w-full flex items-center justify-between p-4 rounded-2xl bg-white border-2 border-dashed border-[#ffc2d1] shadow-lg shadow-[#ffc2d1]/30 active:scale-[0.98] transition-transform">
                            <div class="flex flex-col text-left">
                                <span class="text-[11px] font-handwriting font-bold text-[#9a8c98] uppercase">Tạm tính</span>
                                <span id="gpa-sticky-score" class="text-xl font-handwriting font-bold text-[#fb6f92]">—</span>
                            </div>
                            <div class="flex-1 px-4 flex justify-end">
                                <span id="gpa-sticky-gap" class="text-xs text-slate-500 font-medium"></span>
                            </div>
                            <span class="w-8 h-8 rounded-full bg-[#fff0f3] text-[#fb6f92] flex items-center justify-center border border-[#ffc2d1]">
                                <i class="fas fa-chevron-up text-xs"></i>
                            </span>
                        </button>
                    </div>

                    <button type="button" id="calculate-required-btn"
                        class="gpa-btn-primary w-full mt-6 py-4 text-[16px] flex items-center justify-center gap-2">
                        <i class="fas fa-heart text-sm"></i>
                        Xong goày! Tính Ngay!
                    </button>
                    
                    <div id="required-correct-result" class="mt-8"></div>
                </section>
            </div>'''

pattern = re.compile(r'(\s*)<div id="gpaCalculatorContent".*?(?=\s*<div id="libraryContent")', re.DOTALL)
if pattern.search(content):
    patched = pattern.sub(r'\1' + new_html.strip(), content)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(patched)
    print("Successfully replaced gpaCalculatorContent")
else:
    print("Pattern not found in index.html")
