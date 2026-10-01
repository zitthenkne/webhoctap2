import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_html = r'''            <div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-10 pb-28 max-w-[480px] mx-auto relative mt-4">
                <!-- Nền Caro Sổ Vở - Cực kỳ mờ và nhẹ -->
                <div class="absolute inset-0 opacity-[0.15] z-[-1]" style="background-image: linear-gradient(#f472b6 1.5px, transparent 1.5px), linear-gradient(90deg, #f472b6 1.5px, transparent 1.5px); background-size: 24px 24px; pointer-events: none; border-radius: 40px;"></div>

                <!-- Sparkles trang trí trôi nổi ở background -->
                <div class="absolute top-10 -left-6 text-2xl animate-float-slow opacity-60 pointer-events-none">✨</div>
                <div class="absolute top-40 -right-8 text-3xl animate-float-delayed opacity-50 pointer-events-none">💖</div>
                <div class="absolute bottom-60 -left-8 text-4xl animate-float-slow opacity-40 pointer-events-none">🌸</div>

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

                    @keyframes float-soft {
                        0%, 100% { transform: translateY(0) rotate(-8deg); }
                        50% { transform: translateY(-8px) rotate(-6deg); }
                    }
                    @keyframes pulse-soft {
                        0%, 100% { opacity: 0.8; transform: scale(1); }
                        50% { opacity: 1; transform: scale(1.05); }
                    }
                    @keyframes float-sparkle {
                        0%, 100% { transform: translateY(0) rotate(0); }
                        50% { transform: translateY(-15px) rotate(15deg); }
                    }

                    .animate-float-icon { animation: float-soft 4s ease-in-out infinite; }
                    .animate-pulse-soft { animation: pulse-soft 3s ease-in-out infinite; }
                    .animate-float-slow { animation: float-sparkle 6s ease-in-out infinite; }
                    .animate-float-delayed { animation: float-sparkle 7s ease-in-out infinite; animation-delay: 2s; }

                    /* Khối giấy Note siêu tròn trịa */
                    .gpa-card {
                        background: rgba(255, 255, 255, 0.95);
                        border: 4px solid #fbcfe8;
                        border-radius: 36px;
                        box-shadow: 0 16px 40px -8px rgba(244, 114, 182, 0.25);
                        position: relative;
                        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                        z-index: 1;
                        backdrop-filter: blur(12px);
                    }
                    /* Đường kim chỉ cực kỳ mềm */
                    .gpa-card::before {
                        content: '';
                        position: absolute;
                        inset: 8px;
                        border: 2.5px dashed #f9a8d4;
                        border-radius: 26px;
                        pointer-events: none;
                        z-index: -1;
                        opacity: 0.7;
                    }
                    .gpa-card:hover {
                        transform: translateY(-6px) scale(1.01);
                        box-shadow: 0 25px 50px -12px rgba(244, 114, 182, 0.35);
                        border-color: #f9a8d4;
                    }

                    /* Băng keo mờ mờ dễ thương */
                    .washi-tape {
                        position: absolute;
                        top: -16px;
                        left: 50%;
                        transform: translateX(-50%) rotate(-3deg);
                        width: 110px;
                        height: 30px;
                        background: rgba(254, 240, 138, 0.95);
                        backdrop-filter: blur(4px);
                        z-index: 2;
                        border-radius: 6px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.06);
                        border: 1px dashed rgba(253, 224, 71, 0.6);
                        transition: transform 0.3s ease;
                    }
                    .gpa-card:hover .washi-tape {
                        transform: translateX(-50%) rotate(-5deg) scale(1.05);
                    }
                    .washi-tape-blue { background: rgba(186, 230, 253, 0.95); transform: translateX(-50%) rotate(2deg); }
                    .gpa-card:hover .washi-tape-blue { transform: translateX(-50%) rotate(4deg) scale(1.05); }

                    /* Ô nhập liệu siêu mềm */
                    .gpa-input {
                        background: var(--cute-bg);
                        border: 3px solid transparent;
                        border-radius: 24px;
                        color: var(--cute-text);
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-input:focus {
                        background: #ffffff;
                        border-color: var(--cute-pink);
                        box-shadow: 0 0 0 8px rgba(249, 168, 212, 0.25);
                        outline: none;
                        transform: scale(1.02);
                    }

                    /* Nút bấm siêu tròn như viên kẹo */
                    .gpa-btn-primary {
                        background: linear-gradient(135deg, #f9a8d4, #f472b6);
                        color: white;
                        border-radius: 30px;
                        border: 4px solid #fdf2f8;
                        box-shadow: 0 10px 25px -5px rgba(244, 114, 182, 0.6);
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                        position: relative;
                        overflow: hidden;
                    }
                    .gpa-btn-primary::after {
                        content: '';
                        position: absolute;
                        top: 0; left: -100%;
                        width: 50%; height: 100%;
                        background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent);
                        transform: skewX(-25deg);
                        transition: all 0.5s ease;
                    }
                    .gpa-btn-primary:hover::after {
                        left: 150%;
                    }
                    .gpa-btn-primary:hover {
                        transform: translateY(-4px) scale(1.03);
                        box-shadow: 0 15px 30px -5px rgba(244, 114, 182, 0.7);
                        border-color: white;
                    }
                    .gpa-btn-primary:active {
                        transform: translateY(2px) scale(0.97);
                        box-shadow: 0 5px 10px -5px rgba(244, 114, 182, 0.5);
                    }

                    /* Nút chọn (Chip) */
                    .gpa-chip-btn {
                        background: white;
                        color: var(--cute-text-light);
                        border: 2.5px solid #fbcfe8;
                        border-radius: 20px;
                        font-weight: 700;
                        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-chip-btn:hover {
                        border-color: var(--cute-pink-dark);
                        background: var(--cute-bg);
                        transform: scale(1.08) rotate(-2deg);
                    }
                    .gpa-chip-btn.active {
                        background: linear-gradient(135deg, #f9a8d4, #f472b6);
                        color: white;
                        border-color: #f472b6;
                        box-shadow: 0 4px 10px rgba(244, 114, 182, 0.4);
                        transform: scale(1.05);
                    }

                    /* Bảng chọn mục tiêu điểm */
                    .target-gpa-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
                        gap: 8px;
                    }
                    .target-gpa-box {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 10px 2px;
                        border-radius: 22px;
                        border: 3px solid #fbcfe8;
                        background: #ffffff;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                        color: var(--cute-text-light);
                    }
                    .target-gpa-box:hover {
                        border-color: var(--cute-pink);
                        background: var(--cute-bg);
                        transform: translateY(-4px) scale(1.05);
                    }
                    .target-gpa-box.active {
                        border-color: #fdf2f8;
                        background: linear-gradient(135deg, #f9a8d4, #f472b6);
                        color: white;
                        box-shadow: 0 8px 16px -2px rgba(244, 114, 182, 0.6);
                        transform: scale(1.1) translateY(-2px);
                    }
                    .target-gpa-box.active * { color: white; }
                    
                    /* Thanh chọn Tab mềm mại */
                    .gpa-segmented-control {
                        display: inline-flex;
                        background: #fbcfe8;
                        padding: 8px;
                        border-radius: 30px;
                        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .gpa-segment {
                        padding: 8px 16px;
                        border-radius: 22px;
                        font-size: 14px;
                        font-weight: 700;
                        color: var(--cute-text-light);
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-segment.active {
                        background: #ffffff;
                        color: var(--cute-text);
                        box-shadow: 0 4px 12px rgba(244, 114, 182, 0.3);
                        transform: scale(1.05);
                    }

                    /* Các bước dạng bong bóng */
                    .gpa-step-indicator {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: white;
                        color: var(--cute-pink-dark);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 800;
                        font-size: 18px;
                        flex-shrink: 0;
                        border: 4px solid #fbcfe8;
                        box-shadow: 0 6px 12px rgba(249, 168, 212, 0.3);
                        transition: transform 0.3s;
                    }
                    .gpa-card:hover .gpa-step-indicator {
                        transform: rotate(-15deg) scale(1.1);
                        border-color: #f9a8d4;
                    }
                    
                    /* Thanh kéo range tròn tròn */
                    .gpa-range {
                        -webkit-appearance: none;
                        width: 100%;
                        height: 14px;
                        background: #fce7f3;
                        border-radius: 14px;
                        outline: none;
                        box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .gpa-range::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 28px;
                        height: 28px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #f9a8d4, #f472b6);
                        cursor: pointer;
                        border: 4px solid white;
                        box-shadow: 0 4px 10px rgba(244, 114, 182, 0.5);
                        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .gpa-range::-webkit-slider-thumb:hover { transform: scale(1.25); }
                </style>

                <!-- Phần Header Tròn Trịa -->
                <div class="text-center mb-10 mt-2 relative z-10">
                    <div class="inline-block relative mb-4">
                        <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center border-[5px] border-dashed border-[#fbcfe8] shadow-[0_10px_25px_-5px_rgba(244,114,182,0.4)] animate-float-icon">
                            <i class="fas fa-stethoscope text-5xl text-[#f9a8d4]"></i>
                        </div>
                        <div class="absolute -bottom-2 -right-4 w-12 h-12 bg-gradient-to-br from-[#bae6fd] to-[#7dd3fc] rounded-full shadow-lg flex items-center justify-center border-4 border-white animate-pulse-soft rotate-[10deg]">
                            <span class="text-sky-700 font-cute-title font-bold text-xl">A+</span>
                        </div>
                    </div>
                    <h2 class="text-4xl font-cute-title font-extrabold text-[#831843] tracking-tight mb-2 relative inline-block">
                        Bảng Điểm GPA
                        <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[115%] h-4 bg-[#fbcfe8]/70 rounded-full z-[-1] blur-[2px]"></div>
                    </h2>
                    <p class="text-[#be185d] font-medium text-[15px] mt-3 max-w-[250px] mx-auto bg-white/90 px-5 py-2.5 rounded-full border-2 border-white backdrop-blur-md shadow-sm">Công cụ tính điểm và lập chiến lược học tập</p>
                </div>

                <!-- Thẻ 1: Quy đổi nhanh -->
                <section class="gpa-card p-6 sm:p-8 mb-12 mt-6 relative">
                    <div class="washi-tape washi-tape-blue"></div>
                    
                    <div class="flex items-center gap-4 mb-7 pt-2">
                        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 text-sky-500 flex items-center justify-center text-2xl shrink-0 border-[4px] border-white shadow-md">
                            <i class="fas fa-calculator"></i>
                        </div>
                        <div>
                            <h3 class="text-[22px] font-cute-title font-extrabold text-[#831843]">Quy Đổi Điểm Nhanh</h3>
                            <p class="text-[13px] sm:text-sm text-[#be185d] mt-0.5 font-medium">Tính điểm hệ 10 và điểm chữ tức thì</p>
                        </div>
                    </div>

                    <form id="gpa-form">
                        <div class="flex flex-row gap-4 items-center">
                            <div class="w-full relative">
                                <label for="correct-answers" class="block text-sm font-cute-title font-bold text-[#831843] mb-2 pl-3">Số câu đúng</label>
                                <input type="number" id="correct-answers" min="0" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-sky-500 text-center placeholder:text-pink-200"
                                    placeholder="35">
                            </div>
                            <div class="text-[#fbcfe8] text-5xl font-extrabold font-cute-title mt-6 opacity-70">/</div>
                            <div class="w-full relative">
                                <label for="total-questions" class="block text-sm font-cute-title font-bold text-[#831843] mb-2 pl-3">Tổng số câu</label>
                                <input type="number" id="total-questions" min="1" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-[#831843] text-center placeholder:text-pink-200"
                                    placeholder="50">
                            </div>
                        </div>
                        
                        <div id="total-quick-chips" class="flex flex-wrap items-center justify-center gap-2 mt-6">
                            <span class="text-xs font-cute-title font-bold text-[#f472b6] mr-1">Gợi ý nhanh:</span>
                            <button type="button" data-total="30" class="gpa-chip-btn px-3.5 py-2 text-[13px]">30 câu</button>
                            <button type="button" data-total="40" class="gpa-chip-btn px-3.5 py-2 text-[13px]">40 câu</button>
                            <button type="button" data-total="50" class="gpa-chip-btn px-3.5 py-2 text-[13px]">50 câu</button>
                            <button type="button" data-total="60" class="gpa-chip-btn px-3.5 py-2 text-[13px]">60 câu</button>
                        </div>
                        
                        <button type="button" id="calculate-gpa-btn"
                            class="gpa-btn-primary font-cute-title w-full mt-7 py-3.5 text-xl flex items-center justify-center gap-2 tracking-wide">
                            <i class="fas fa-wand-magic-sparkles text-lg"></i> Quy Đổi Điểm
                        </button>
                    </form>
                    
                    <div id="gpa-result-area" class="mt-6 hidden"></div>
                    
                    <details class="mt-8 group border-[3px] border-dashed border-[#fbcfe8] rounded-[28px] overflow-hidden bg-white/70 backdrop-blur-sm">
                        <summary class="cursor-pointer list-none flex items-center justify-between p-4 px-5 hover:bg-[#fdf2f8] transition-colors">
                            <span class="text-[15px] font-cute-title font-bold text-[#831843] flex items-center gap-2.5">
                                <i class="fas fa-table-list text-[#f472b6] text-lg"></i> Bảng quy đổi điểm UMP
                            </span>
                            <div class="w-8 h-8 rounded-full bg-[#fdf2f8] flex items-center justify-center group-open:bg-[#fbcfe8] transition-colors">
                                <i class="fas fa-chevron-down text-sm text-[#f9a8d4] group-open:text-[#be185d] transition-transform group-open:rotate-180"></i>
                            </div>
                        </summary>
                        <div class="bg-white p-3 overflow-x-auto border-t-[3px] border-dashed border-[#fbcfe8]">
                            <table class="w-full text-center gpa-reference-table min-w-[300px]">
                                <thead>
                                    <tr>
                                        <th class="font-cute-title text-[15px]">Hệ 10</th>
                                        <th class="font-cute-title text-[15px]">Hệ 4</th>
                                        <th class="font-cute-title text-[15px]">Điểm Chữ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>9.5 – 10</td><td>4.0</td><td><span class="text-pink-600 font-bold bg-pink-50 px-3 py-1.5 rounded-2xl border border-pink-100">A+</span></td></tr>
                                    <tr><td>8.5 – 9.4</td><td>4.0</td><td><span class="text-pink-600 font-bold bg-pink-50 px-3 py-1.5 rounded-2xl border border-pink-100">A</span></td></tr>
                                    <tr><td>8.0 – 8.4</td><td>3.5</td><td><span class="text-sky-500 font-bold bg-sky-50 px-3 py-1.5 rounded-2xl border border-sky-100">B+</span></td></tr>
                                    <tr><td>7.0 – 7.9</td><td>3.0</td><td><span class="text-sky-500 font-bold bg-sky-50 px-3 py-1.5 rounded-2xl border border-sky-100">B</span></td></tr>
                                    <tr><td>6.5 – 6.9</td><td>2.5</td><td><span class="text-teal-600 font-bold bg-teal-50 px-3 py-1.5 rounded-2xl border border-teal-100">C+</span></td></tr>
                                    <tr><td>5.5 – 6.4</td><td>2.0</td><td><span class="text-teal-600 font-bold bg-teal-50 px-3 py-1.5 rounded-2xl border border-teal-100">C</span></td></tr>
                                    <tr><td>5.0 – 5.4</td><td>1.5</td><td><span class="text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-2xl border border-amber-100">D+</span></td></tr>
                                    <tr><td>4.0 – 4.9</td><td>1.0</td><td><span class="text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-2xl border border-amber-100">D</span></td></tr>
                                    <tr><td>&lt; 4.0</td><td>0.0</td><td><span class="text-slate-400 font-bold bg-slate-100 px-3 py-1.5 rounded-2xl border border-slate-200">F</span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>

                <!-- Thẻ 2: Chiến lược -->
                <section id="required-correct-section" class="gpa-card p-6 sm:p-8 mb-8 mt-8 relative">
                    <div class="washi-tape"></div>

                    <div class="flex items-center gap-4 mb-8 pt-2">
                        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-[#fdf2f8] to-[#fbcfe8] text-[#f472b6] flex items-center justify-center text-2xl shrink-0 border-[4px] border-white shadow-md">
                            <i class="fas fa-bullseye"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-[22px] font-cute-title font-extrabold text-[#831843]">Chiến Lược Môn Học</h3>
                            <p class="text-[13px] sm:text-sm text-[#be185d] mt-0.5 font-medium">Lập kế hoạch phân bổ số câu đúng</p>
                        </div>
                        <button type="button" id="reset-goal-btn"
                            class="w-11 h-11 flex items-center justify-center bg-white border-[3px] border-dashed border-[#fbcfe8] hover:border-[#f472b6] hover:bg-[#fdf2f8] text-[#f9a8d4] hover:text-[#f472b6] rounded-full transition-all shrink-0 shadow-sm"
                            title="Làm mới">
                            <i class="fas fa-rotate-left"></i>
                        </button>
                    </div>

                    <!-- Môn học -->
                    <div class="mb-8 p-4 px-5 bg-white rounded-[32px] border-[3px] border-dashed border-[#fbcfe8] relative overflow-hidden">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-[15px] font-cute-title font-bold text-[#831843]"><i class="fas fa-book-bookmark text-[#f9a8d4] mr-2"></i> Môn học đang theo dõi</span>
                            <div class="flex gap-2">
                                <button type="button" id="rename-subject-btn" class="w-8 h-8 flex items-center justify-center rounded-full bg-[#fdf2f8] text-[#f472b6] hover:bg-[#fbcfe8] transition-colors" title="Đổi tên"><i class="fas fa-pen text-[11px]"></i></button>
                                <button type="button" id="delete-subject-btn" class="w-8 h-8 flex items-center justify-center rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100 transition-colors" title="Xoá môn"><i class="fas fa-trash-can text-[11px]"></i></button>
                            </div>
                        </div>
                        <div id="subject-chips" class="flex gap-2 overflow-x-auto pb-2 scrollbar-none mt-2">
                            <!-- JS render chips here -->
                        </div>
                    </div>

                    <!-- Tổng kết kỳ học -->
                    <details id="semester-gpa" class="group mb-10 rounded-[32px] border-[3px] border-dashed border-[#bae6fd] bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe] overflow-hidden shadow-sm">
                        <summary class="cursor-pointer list-none flex items-center gap-4 p-5 select-none hover:bg-white/40 transition-colors relative">
                            <div class="w-12 h-12 rounded-full bg-white text-sky-400 flex items-center justify-center shrink-0 border-[3px] border-[#bae6fd] shadow-sm">
                                <i class="fas fa-graduation-cap text-lg"></i>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-[15px] font-cute-title font-bold text-sky-900">Tổng kết học kỳ</span>
                                <span id="semester-gpa-sub" class="text-[13px] font-medium text-sky-600 mt-0.5"></span>
                            </div>
                            <div class="ml-auto text-right">
                                <span id="semester-gpa-value" class="text-2xl font-cute-title font-extrabold text-sky-500 drop-shadow-sm">—</span>
                            </div>
                            <div class="w-8 h-8 rounded-full bg-white/50 ml-3 flex items-center justify-center group-open:bg-white transition-colors">
                                <i class="fas fa-chevron-down text-sm text-sky-400 transition-transform group-open:rotate-180"></i>
                            </div>
                        </summary>
                        <div id="semester-gpa-body" class="p-5 pt-2 border-t-[3px] border-dashed border-[#bae6fd]/50 mt-1">
                            <!-- JS render -->
                        </div>
                    </details>

                    <!-- Step 1 -->
                    <div class="flex gap-4 mb-9 relative">
                        <div class="gpa-step-indicator font-cute-title shadow-sm">1</div>
                        <div class="flex-1">
                            <h4 class="text-[16px] font-cute-title font-extrabold text-[#831843] mb-3 mt-1.5">Cấu trúc đợt thi</h4>
                            <select id="exam-type" class="gpa-input w-full px-5 py-3.5 text-[15px] font-bold cursor-pointer">
                                <option value="pretest">Có Pre-test (10% - 20% - 70%)</option>
                                <option value="nopretest">Không Pre-test (30% - 70%)</option>
                                <option value="custom">Tùy chỉnh tỷ lệ (Tự nhập)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex gap-4 mb-9 relative">
                        <div class="gpa-step-indicator font-cute-title shadow-sm">2</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-5 mt-1.5 gap-4">
                                <h4 class="text-[16px] font-cute-title font-extrabold text-[#831843]">Mục tiêu điểm số</h4>
                                <div id="target-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-target-mode="gpa4" class="target-mode-btn gpa-segment active">Hệ 4</button>
                                    <button type="button" data-target-mode="score10" class="target-mode-btn gpa-segment">Hệ 10</button>
                                </div>
                            </div>
                            
                            <input type="hidden" id="desired-gpa-4" value="4.0">
                            
                            <!-- Hệ 10 Input -->
                            <div id="desired-10-wrap" class="hidden bg-white rounded-[28px] p-5 border-[3px] border-dashed border-[#fbcfe8] shadow-sm">
                                <div class="flex flex-col items-center gap-5">
                                    <div class="flex items-center gap-3 w-full justify-center">
                                        <span class="text-[15px] font-cute-title font-bold text-[#be185d]">Điểm:</span>
                                        <input type="number" id="desired-score-10" min="0" max="10" step="0.1" inputmode="decimal" value="8.5"
                                            class="gpa-input w-28 px-4 py-3 text-center text-3xl font-bold text-[#831843]">
                                    </div>
                                    <div class="w-full px-2 mt-2">
                                        <input type="range" id="desired-score-10-range" min="0" max="10" step="0.1" value="8.5"
                                            class="gpa-range">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Hệ 4 Grid -->
                            <div id="desired-gpa-chips" class="target-gpa-grid mt-2">
                                <button type="button" data-gpa="1.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">D</span><span class="text-[13px] font-medium opacity-80">1.0</span>
                                </button>
                                <button type="button" data-gpa="1.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">D+</span><span class="text-[13px] font-medium opacity-80">1.5</span>
                                </button>
                                <button type="button" data-gpa="2.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">C</span><span class="text-[13px] font-medium opacity-80">2.0</span>
                                </button>
                                <button type="button" data-gpa="2.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">C+</span><span class="text-[13px] font-medium opacity-80">2.5</span>
                                </button>
                                <button type="button" data-gpa="3.0" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">B</span><span class="text-[13px] font-medium opacity-80">3.0</span>
                                </button>
                                <button type="button" data-gpa="3.5" class="gpa-chip target-gpa-box font-cute-title">
                                    <span class="text-2xl font-bold">B+</span><span class="text-[13px] font-medium opacity-80">3.5</span>
                                </button>
                                <button type="button" data-gpa="4.0" class="gpa-chip target-gpa-box active font-cute-title">
                                    <span class="text-2xl font-bold">A</span><span class="text-[13px] font-medium opacity-90">4.0</span>
                                </button>
                            </div>
                            
                            <p id="desired-target-hint" class="text-[14px] font-medium text-[#be185d] bg-white border-[3px] border-dashed border-[#fbcfe8] p-4 rounded-3xl mt-5 hidden shadow-sm text-center"></p>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex gap-4 mb-4 relative">
                        <div class="gpa-step-indicator font-cute-title shadow-sm">3</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-4 mt-1.5">
                                <h4 class="text-[16px] font-cute-title font-extrabold text-[#831843]">Thông tin các đợt thi</h4>
                                <div id="scale-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-mode="ump" class="scale-mode-btn gpa-segment active">Khung UMP</button>
                                    <button type="button" data-mode="linear" class="scale-mode-btn gpa-segment">% tuyến tính</button>
                                </div>
                            </div>

                            <div id="attempts-table" class="space-y-5">
                                <!-- JS render inputs -->
                            </div>
                        </div>
                    </div>

                    <div id="gpa-live-projection" class="hidden"></div>
                    
                    <!-- Sticky Mobile Bar -->
                    <div id="gpa-sticky-bar" class="hidden sm:hidden sticky bottom-[5rem] z-20 mb-4 px-2">
                        <button type="button" id="gpa-sticky-btn"
                            class="w-full flex items-center justify-between p-4 px-5 rounded-full bg-white border-[4px] border-[#fbcfe8] shadow-[0_15px_30px_-5px_rgba(244,114,182,0.4)] active:scale-[0.97] transition-all">
                            <div class="flex flex-col text-left pl-2">
                                <span class="text-[12px] font-cute-title font-bold text-[#f472b6] uppercase tracking-wider">Tạm tính</span>
                                <span id="gpa-sticky-score" class="text-3xl font-cute-title font-bold text-[#831843] leading-none mt-1">—</span>
                            </div>
                            <div class="flex-1 px-4 flex justify-end">
                                <span id="gpa-sticky-gap" class="text-[13px] text-[#be185d] font-bold"></span>
                            </div>
                            <span class="w-12 h-12 rounded-full bg-gradient-to-br from-[#fdf2f8] to-[#fbcfe8] text-[#f472b6] flex items-center justify-center border-2 border-white shadow-sm">
                                <i class="fas fa-chevron-up text-base"></i>
                            </span>
                        </button>
                    </div>

                    <button type="button" id="calculate-required-btn"
                        class="gpa-btn-primary font-cute-title w-full mt-10 py-4 text-[22px] flex items-center justify-center gap-3 tracking-wide">
                        <i class="fas fa-heart text-xl animate-pulse-soft"></i>
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
    print("Successfully replaced gpaCalculatorContent with extreme cute style")
else:
    print("Pattern not found in index.html")
