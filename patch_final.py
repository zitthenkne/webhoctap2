import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_html = r'''            <div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-8 pb-28 max-w-xl mx-auto relative">
                <!-- Nền Caro Sổ Vở - Cực kỳ mờ và nhẹ -->
                <div class="absolute inset-0 opacity-20 z-[-1]" style="background-image: linear-gradient(#f472b6 1px, transparent 1px), linear-gradient(90deg, #f472b6 1px, transparent 1px); background-size: 20px 20px; pointer-events: none; border-radius: 40px;"></div>

                <style id="gpa-premium-styles">
                    /* Cực kỳ mềm mại, tròn trịa, dùng font mặc định của web (Quicksand/Baloo 2) */
                    :root {
                        --cute-pink: #f9a8d4;
                        --cute-pink-dark: #f472b6;
                        --cute-bg: #fdf2f8;
                        --cute-text: #831843;
                        --cute-text-light: #be185d;
                        --cute-blue: #bae6fd;
                        --cute-yellow: #fef08a;
                    }

                    #gpaCalculatorContent {
                        color: var(--cute-text);
                    }

                    .font-cute-title {
                        font-family: 'Baloo 2', cursive;
                    }

                    /* Khối giấy Note siêu tròn trịa */
                    .gpa-card {
                        background: rgba(255, 255, 255, 0.95);
                        border: 3px solid #fbcfe8;
                        border-radius: 32px;
                        box-shadow: 0 10px 25px -5px rgba(244, 114, 182, 0.2);
                        position: relative;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        z-index: 1;
                        backdrop-filter: blur(8px);
                    }
                    /* Đường kim chỉ cực kỳ mềm */
                    .gpa-card::before {
                        content: '';
                        position: absolute;
                        inset: 8px;
                        border: 2px dashed #fbcfe8;
                        border-radius: 24px;
                        pointer-events: none;
                        z-index: -1;
                    }
                    .gpa-card:hover {
                        transform: translateY(-4px);
                        box-shadow: 0 15px 35px -5px rgba(244, 114, 182, 0.3);
                        border-color: #f9a8d4;
                    }

                    /* Băng keo mờ mờ dễ thương */
                    .washi-tape {
                        position: absolute;
                        top: -14px;
                        left: 50%;
                        transform: translateX(-50%) rotate(-3deg);
                        width: 100px;
                        height: 26px;
                        background: rgba(254, 240, 138, 0.9);
                        backdrop-filter: blur(4px);
                        z-index: 2;
                        border-radius: 4px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                        border: 1px dashed rgba(253, 224, 71, 0.5);
                    }
                    .washi-tape-blue { background: rgba(186, 230, 253, 0.9); transform: translateX(-50%) rotate(2deg); }

                    /* Ô nhập liệu siêu mềm */
                    .gpa-input {
                        background: var(--cute-bg);
                        border: 2px solid transparent;
                        border-radius: 20px;
                        color: var(--cute-text);
                        transition: all 0.3s ease;
                    }
                    .gpa-input:focus {
                        background: #ffffff;
                        border-color: var(--cute-pink);
                        box-shadow: 0 0 0 6px rgba(249, 168, 212, 0.2);
                        outline: none;
                    }

                    /* Nút bấm siêu tròn như viên kẹo */
                    .gpa-btn-primary {
                        background: linear-gradient(135deg, #f9a8d4, #f472b6);
                        color: white;
                        border-radius: 24px;
                        border: none;
                        box-shadow: 0 8px 16px -4px rgba(244, 114, 182, 0.5);
                        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-btn-primary:hover {
                        transform: translateY(-2px) scale(1.02);
                        box-shadow: 0 12px 20px -4px rgba(244, 114, 182, 0.6);
                    }
                    .gpa-btn-primary:active {
                        transform: translateY(2px) scale(0.98);
                        box-shadow: 0 4px 8px -4px rgba(244, 114, 182, 0.5);
                    }

                    /* Nút chọn (Chip) */
                    .gpa-chip-btn {
                        background: white;
                        color: var(--cute-text-light);
                        border: 2px solid #fbcfe8;
                        border-radius: 16px;
                        font-weight: 700;
                        transition: all 0.2s ease;
                    }
                    .gpa-chip-btn:hover {
                        border-color: var(--cute-pink);
                        background: var(--cute-bg);
                        transform: scale(1.05);
                    }
                    .gpa-chip-btn.active {
                        background: var(--cute-pink);
                        color: white;
                        border-color: var(--cute-pink-dark);
                    }

                    /* Bảng chọn mục tiêu điểm */
                    .target-gpa-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
                        gap: 10px;
                    }
                    .target-gpa-box {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 10px 4px;
                        border-radius: 20px;
                        border: 2px solid #fbcfe8;
                        background: #ffffff;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        color: var(--cute-text-light);
                    }
                    .target-gpa-box:hover {
                        border-color: var(--cute-pink);
                        background: var(--cute-bg);
                        transform: translateY(-3px);
                    }
                    .target-gpa-box.active {
                        border-color: var(--cute-pink-dark);
                        background: var(--cute-pink);
                        color: white;
                        box-shadow: 0 8px 16px -4px rgba(244, 114, 182, 0.5);
                        transform: scale(1.05);
                    }
                    .target-gpa-box.active * { color: white; }
                    
                    /* Thanh chọn Tab mềm mại */
                    .gpa-segmented-control {
                        display: inline-flex;
                        background: #fbcfe8;
                        padding: 6px;
                        border-radius: 24px;
                    }
                    .gpa-segment {
                        padding: 6px 16px;
                        border-radius: 18px;
                        font-size: 14px;
                        font-weight: 700;
                        color: var(--cute-text-light);
                        transition: all 0.2s ease;
                    }
                    .gpa-segment.active {
                        background: #ffffff;
                        color: var(--cute-text);
                        box-shadow: 0 4px 12px rgba(244, 114, 182, 0.2);
                    }

                    /* Các bước dạng bong bóng */
                    .gpa-step-indicator {
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: var(--cute-bg);
                        color: var(--cute-pink-dark);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 800;
                        font-size: 16px;
                        flex-shrink: 0;
                        border: 3px solid #fbcfe8;
                        box-shadow: 0 4px 10px rgba(249, 168, 212, 0.4);
                    }
                    
                    /* Thanh kéo range tròn tròn */
                    .gpa-range {
                        -webkit-appearance: none;
                        width: 100%;
                        height: 12px;
                        background: #fce7f3;
                        border-radius: 12px;
                        outline: none;
                    }
                    .gpa-range::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: var(--cute-pink-dark);
                        cursor: pointer;
                        border: 4px solid white;
                        box-shadow: 0 4px 8px rgba(244, 114, 182, 0.4);
                        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-range::-webkit-slider-thumb:hover { transform: scale(1.2); }

                    /* Bảng mềm mại */
                    .gpa-reference-table {
                        border-collapse: separate;
                        border-spacing: 0;
                        border-radius: 24px;
                        overflow: hidden;
                        border: 2px solid #fbcfe8;
                        background: white;
                    }
                    .gpa-reference-table th {
                        background: var(--cute-bg);
                        color: var(--cute-text);
                        padding: 12px;
                        border-bottom: 2px solid #fbcfe8;
                    }
                    .gpa-reference-table td {
                        padding: 12px;
                        font-size: 14px;
                        font-weight: 600;
                        border-bottom: 1px dashed #fbcfe8;
                    }
                </style>

                <!-- Phần Header Tròn Trịa -->
                <div class="text-center mb-8 mt-2 relative z-10">
                    <div class="inline-block relative mb-3">
                        <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center rotate-[8deg] border-4 border-dashed border-[#fbcfe8] shadow-lg">
                            <i class="fas fa-stethoscope text-4xl text-[#f9a8d4] -rotate-[8deg]"></i>
                        </div>
                        <div class="absolute -bottom-1 -right-3 w-10 h-10 bg-[#bae6fd] rounded-full shadow-md flex items-center justify-center border-2 border-white rotate-[-12deg]">
                            <span class="text-sky-600 font-cute-title font-bold text-lg">A+</span>
                        </div>
                    </div>
                    <h2 class="text-3xl font-cute-title font-extrabold text-[#831843] tracking-tight mb-2 relative inline-block">
                        Bảng Điểm GPA
                        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[110%] h-3 bg-[#fbcfe8]/60 rounded-full z-[-1]"></div>
                    </h2>
                    <p class="text-[#be185d] font-medium text-sm mt-2 max-w-sm mx-auto bg-white/80 px-4 py-2 rounded-full border border-white backdrop-blur-sm shadow-sm">Công cụ tính điểm và lập chiến lược học tập</p>
                </div>

                <!-- Thẻ 1: Quy đổi nhanh -->
                <section class="gpa-card p-6 sm:p-8 mb-10 mt-6 relative">
                    <div class="washi-tape washi-tape-blue"></div>
                    
                    <div class="flex items-center gap-4 mb-6 pt-2">
                        <div class="w-12 h-12 rounded-full bg-sky-100 text-sky-500 flex items-center justify-center text-xl shrink-0 border-4 border-white shadow-md">
                            <i class="fas fa-calculator"></i>
                        </div>
                        <div>
                            <h3 class="text-xl font-cute-title font-extrabold text-[#831843]">Quy Đổi Điểm Nhanh</h3>
                            <p class="text-xs sm:text-sm text-[#be185d] mt-0.5 font-medium">Tính điểm hệ 10 và điểm chữ tức thì</p>
                        </div>
                    </div>

                    <form id="gpa-form">
                        <div class="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                            <div class="w-full relative">
                                <label for="correct-answers" class="block text-sm font-cute-title font-bold text-[#831843] mb-2 pl-2">Số câu đúng</label>
                                <input type="number" id="correct-answers" min="0" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-3 text-3xl font-bold text-sky-500 text-center placeholder:text-pink-200"
                                    placeholder="35">
                            </div>
                            <div class="text-[#fbcfe8] text-4xl font-extrabold font-cute-title hidden sm:block mt-6">/</div>
                            <div class="w-full relative">
                                <label for="total-questions" class="block text-sm font-cute-title font-bold text-[#831843] mb-2 pl-2">Tổng số câu</label>
                                <input type="number" id="total-questions" min="1" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-3 text-3xl font-bold text-[#831843] text-center placeholder:text-pink-200"
                                    placeholder="50">
                            </div>
                        </div>
                        
                        <div id="total-quick-chips" class="flex flex-wrap items-center justify-center gap-2 mt-5">
                            <span class="text-xs font-cute-title font-bold text-[#f472b6] mr-1">Gợi ý nhanh:</span>
                            <button type="button" data-total="30" class="gpa-chip-btn px-3 py-1.5 text-xs">30 câu</button>
                            <button type="button" data-total="40" class="gpa-chip-btn px-3 py-1.5 text-xs">40 câu</button>
                            <button type="button" data-total="50" class="gpa-chip-btn px-3 py-1.5 text-xs">50 câu</button>
                            <button type="button" data-total="60" class="gpa-chip-btn px-3 py-1.5 text-xs">60 câu</button>
                            <button type="button" data-total="100" class="gpa-chip-btn px-3 py-1.5 text-xs">100 câu</button>
                        </div>
                        
                        <button type="button" id="calculate-gpa-btn"
                            class="gpa-btn-primary font-cute-title w-full mt-6 py-3 text-lg flex items-center justify-center gap-2 tracking-wide">
                            <i class="fas fa-wand-magic-sparkles"></i> Quy Đổi Điểm
                        </button>
                    </form>
                    
                    <div id="gpa-result-area" class="mt-6 hidden"></div>
                    
                    <details class="mt-6 group border-2 border-dashed border-[#fbcfe8] rounded-3xl overflow-hidden bg-white">
                        <summary class="cursor-pointer list-none flex items-center justify-between p-4 hover:bg-[#fdf2f8] transition-colors">
                            <span class="text-sm font-cute-title font-bold text-[#831843] flex items-center gap-2">
                                <i class="fas fa-table-list text-[#f472b6]"></i> Bảng quy đổi điểm UMP
                            </span>
                            <i class="fas fa-chevron-down text-xs text-[#f9a8d4] transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div class="bg-white p-3 overflow-x-auto">
                            <table class="w-full text-center gpa-reference-table min-w-[300px]">
                                <thead>
                                    <tr>
                                        <th class="font-cute-title">Hệ 10</th>
                                        <th class="font-cute-title">Hệ 4</th>
                                        <th class="font-cute-title">Điểm Chữ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>9.5 – 10</td><td>4.0</td><td><span class="text-pink-600 font-bold bg-pink-50 px-2 py-1 rounded-xl">A+</span></td></tr>
                                    <tr><td>8.5 – 9.4</td><td>4.0</td><td><span class="text-pink-600 font-bold bg-pink-50 px-2 py-1 rounded-xl">A</span></td></tr>
                                    <tr><td>8.0 – 8.4</td><td>3.5</td><td><span class="text-sky-500 font-bold bg-sky-50 px-2 py-1 rounded-xl">B+</span></td></tr>
                                    <tr><td>7.0 – 7.9</td><td>3.0</td><td><span class="text-sky-500 font-bold bg-sky-50 px-2 py-1 rounded-xl">B</span></td></tr>
                                    <tr><td>6.5 – 6.9</td><td>2.5</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-xl">C+</span></td></tr>
                                    <tr><td>5.5 – 6.4</td><td>2.0</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-xl">C</span></td></tr>
                                    <tr><td>5.0 – 5.4</td><td>1.5</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-xl">D+</span></td></tr>
                                    <tr><td>4.0 – 4.9</td><td>1.0</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-xl">D</span></td></tr>
                                    <tr><td>&lt; 4.0</td><td>0.0</td><td><span class="text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-xl">F</span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>

                <!-- Thẻ 2: Chiến lược -->
                <section id="required-correct-section" class="gpa-card p-6 sm:p-8 mb-8 mt-6 relative">
                    <div class="washi-tape"></div>

                    <div class="flex items-center gap-4 mb-8 pt-2">
                        <div class="w-12 h-12 rounded-full bg-[#fdf2f8] text-[#f472b6] flex items-center justify-center text-xl shrink-0 border-4 border-[#fbcfe8] shadow-sm">
                            <i class="fas fa-bullseye"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-xl font-cute-title font-extrabold text-[#831843]">Chiến Lược Môn Học</h3>
                            <p class="text-xs sm:text-sm text-[#be185d] mt-0.5 font-medium">Lập kế hoạch phân bổ số câu đúng</p>
                        </div>
                        <button type="button" id="reset-goal-btn"
                            class="w-10 h-10 flex items-center justify-center bg-white border-2 border-dashed border-[#fbcfe8] hover:border-[#f472b6] hover:bg-[#fdf2f8] text-[#f9a8d4] hover:text-[#f472b6] rounded-full transition-all shrink-0 shadow-sm"
                            title="Làm mới">
                            <i class="fas fa-rotate-left"></i>
                        </button>
                    </div>

                    <!-- Môn học -->
                    <div class="mb-8 p-4 bg-white rounded-3xl border-2 border-dashed border-[#fbcfe8] relative overflow-hidden">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-sm font-cute-title font-bold text-[#831843]"><i class="fas fa-book-bookmark text-[#f9a8d4] mr-1"></i> Môn học đang theo dõi</span>
                            <div class="flex gap-2">
                                <button type="button" id="rename-subject-btn" class="w-8 h-8 flex items-center justify-center rounded-full bg-[#fdf2f8] text-[#f472b6] hover:bg-[#fbcfe8] transition-colors" title="Đổi tên"><i class="fas fa-pen text-[11px]"></i></button>
                                <button type="button" id="delete-subject-btn" class="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100 transition-colors" title="Xoá môn"><i class="fas fa-trash-can text-[11px]"></i></button>
                            </div>
                        </div>
                        <div id="subject-chips" class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                            <!-- JS render chips here -->
                        </div>
                    </div>

                    <!-- Tổng kết kỳ học -->
                    <details id="semester-gpa" class="group mb-8 rounded-3xl border-2 border-dashed border-[#bae6fd] bg-[#f0f9ff] overflow-hidden">
                        <summary class="cursor-pointer list-none flex items-center gap-3 p-4 select-none hover:bg-[#e0f2fe] transition-colors relative">
                            <div class="w-10 h-10 rounded-full bg-white text-sky-400 flex items-center justify-center shrink-0 border-2 border-[#bae6fd] shadow-sm">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-sm font-cute-title font-bold text-sky-900">Tổng kết học kỳ</span>
                                <span id="semester-gpa-sub" class="text-xs font-medium text-sky-600 mt-0.5"></span>
                            </div>
                            <div class="ml-auto text-right">
                                <span id="semester-gpa-value" class="text-xl font-cute-title font-extrabold text-sky-500">—</span>
                            </div>
                            <i class="fas fa-chevron-down text-xs text-sky-400 ml-2 transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div id="semester-gpa-body" class="p-4 pt-0 border-t border-dashed border-[#bae6fd] mt-1">
                            <!-- JS render -->
                        </div>
                    </details>

                    <!-- Step 1 -->
                    <div class="flex gap-4 mb-8 relative">
                        <div class="gpa-step-indicator font-cute-title">1</div>
                        <div class="flex-1">
                            <h4 class="text-[15px] font-cute-title font-extrabold text-[#831843] mb-3 mt-1.5">Cấu trúc đợt thi</h4>
                            <select id="exam-type" class="gpa-input w-full px-4 py-3 text-sm font-bold cursor-pointer">
                                <option value="pretest">Có Pre-test (10% - 20% - 70%)</option>
                                <option value="nopretest">Không Pre-test (30% - 70%)</option>
                                <option value="custom">Tùy chỉnh tỷ lệ (Tự nhập)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex gap-4 mb-8 relative">
                        <div class="gpa-step-indicator font-cute-title">2</div>
                        <div class="flex-1">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 mt-1.5 gap-3">
                                <h4 class="text-[15px] font-cute-title font-extrabold text-[#831843]">Mục tiêu điểm số</h4>
                                <div id="target-mode-toggle" class="gpa-segmented-control self-start sm:self-auto shadow-inner">
                                    <button type="button" data-target-mode="gpa4" class="target-mode-btn gpa-segment active">Hệ 4</button>
                                    <button type="button" data-target-mode="score10" class="target-mode-btn gpa-segment">Hệ 10</button>
                                </div>
                            </div>
                            
                            <input type="hidden" id="desired-gpa-4" value="4.0">
                            
                            <!-- Hệ 10 Input -->
                            <div id="desired-10-wrap" class="hidden bg-white rounded-3xl p-5 border-2 border-dashed border-[#fbcfe8]">
                                <div class="flex flex-col sm:flex-row items-center gap-5">
                                    <div class="flex items-center gap-3 w-full">
                                        <span class="text-sm font-cute-title font-bold text-[#be185d] w-12">Điểm:</span>
                                        <input type="number" id="desired-score-10" min="0" max="10" step="0.1" inputmode="decimal" value="8.5"
                                            class="gpa-input w-24 px-3 py-2 text-center text-2xl font-bold text-[#831843]">
                                    </div>
                                    <div class="w-full">
                                        <input type="range" id="desired-score-10-range" min="0" max="10" step="0.1" value="8.5"
                                            class="gpa-range">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Hệ 4 Grid -->
                            <div id="desired-gpa-chips" class="target-gpa-grid">
                                <button type="button" data-gpa="1.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">D</span><span class="text-[12px] font-medium opacity-80">1.0</span>
                                </button>
                                <button type="button" data-gpa="1.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">D+</span><span class="text-[12px] font-medium opacity-80">1.5</span>
                                </button>
                                <button type="button" data-gpa="2.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">C</span><span class="text-[12px] font-medium opacity-80">2.0</span>
                                </button>
                                <button type="button" data-gpa="2.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">C+</span><span class="text-[12px] font-medium opacity-80">2.5</span>
                                </button>
                                <button type="button" data-gpa="3.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">B</span><span class="text-[12px] font-medium opacity-80">3.0</span>
                                </button>
                                <button type="button" data-gpa="3.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-xl font-bold">B+</span><span class="text-[12px] font-medium opacity-80">3.5</span>
                                </button>
                                <button type="button" data-gpa="4.0" class="gpa-chip target-gpa-box active font-cute-title">
                                    <span class="text-xl font-bold">A</span><span class="text-[12px] font-medium opacity-90">4.0</span>
                                </button>
                            </div>
                            
                            <p id="desired-target-hint" class="text-[13px] font-medium text-[#be185d] bg-white border-2 border-dashed border-[#fbcfe8] p-3 rounded-2xl mt-4 hidden shadow-sm"></p>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex gap-4 mb-4 relative">
                        <div class="gpa-step-indicator font-cute-title">3</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 mt-1.5">
                                <h4 class="text-[15px] font-cute-title font-extrabold text-[#831843]">Thông tin các đợt thi</h4>
                                <div id="scale-mode-toggle" class="gpa-segmented-control self-start sm:self-auto shadow-inner">
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
                            class="w-full flex items-center justify-between p-4 rounded-full bg-white border-4 border-[#fbcfe8] shadow-xl active:scale-[0.98] transition-transform">
                            <div class="flex flex-col text-left pl-2">
                                <span class="text-[11px] font-cute-title font-bold text-[#f472b6] uppercase">Tạm tính</span>
                                <span id="gpa-sticky-score" class="text-2xl font-cute-title font-bold text-[#831843]">—</span>
                            </div>
                            <div class="flex-1 px-4 flex justify-end">
                                <span id="gpa-sticky-gap" class="text-xs text-[#be185d] font-medium"></span>
                            </div>
                            <span class="w-10 h-10 rounded-full bg-[#fdf2f8] text-[#f472b6] flex items-center justify-center border-2 border-[#fbcfe8]">
                                <i class="fas fa-chevron-up text-sm"></i>
                            </span>
                        </button>
                    </div>

                    <button type="button" id="calculate-required-btn"
                        class="gpa-btn-primary font-cute-title w-full mt-8 py-3 text-lg flex items-center justify-center gap-2 tracking-wide">
                        <i class="fas fa-heart text-base"></i>
                        Phân Tích Chiến Lược
                    </button>
                    
                    <div id="required-correct-result" class="mt-8"></div>
                </section>
            </div>'''

pattern = re.compile(r'(\s*)<div id="gpaCalculatorContent".*?(?=\s*<div id="libraryContent")', re.DOTALL)
if pattern.search(content):
    patched = pattern.sub(r'\1' + new_html.strip(), content)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(patched)
    print("Successfully replaced gpaCalculatorContent with round, cute style")
else:
    print("Pattern not found in index.html")
