import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_html = r'''            <div id="gpaCalculatorContent" class="content-panel hidden fade-in px-4 sm:px-6 pt-6 pb-28 max-w-3xl mx-auto">
                <style id="gpa-premium-styles">
                    /* Premium Minimalist UI Styles */
                    :root {
                        --gpa-accent: #f43f5e;
                        --gpa-accent-hover: #e11d48;
                        --gpa-surface: #ffffff;
                        --gpa-bg: #f8fafc;
                        --gpa-border: #f1f5f9;
                        --gpa-text-main: #0f172a;
                        --gpa-text-muted: #64748b;
                    }

                    #gpaCalculatorContent {
                        font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
                        color: var(--gpa-text-main);
                    }

                    /* Glassy Cards */
                    .gpa-card {
                        background: var(--gpa-surface);
                        border: 1px solid var(--gpa-border);
                        border-radius: 24px;
                        box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.03), 0 2px 8px -2px rgba(0, 0, 0, 0.02);
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .gpa-card:hover {
                        box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03);
                        border-color: #e2e8f0;
                    }

                    /* Inputs */
                    .gpa-input {
                        background: #f8fafc;
                        border: 2px solid transparent;
                        border-radius: 16px;
                        color: var(--gpa-text-main);
                        transition: all 0.2s ease;
                    }
                    .gpa-input:focus {
                        background: #ffffff;
                        border-color: var(--gpa-accent);
                        box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.1);
                        outline: none;
                    }

                    /* Buttons */
                    .gpa-btn-primary {
                        background: var(--gpa-accent);
                        color: white;
                        border-radius: 16px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25);
                    }
                    .gpa-btn-primary:hover {
                        background: var(--gpa-accent-hover);
                        transform: translateY(-2px);
                        box-shadow: 0 6px 16px rgba(244, 63, 94, 0.35);
                    }
                    .gpa-btn-primary:active {
                        transform: translateY(0);
                    }

                    /* Chips */
                    .gpa-chip-btn {
                        background: #f1f5f9;
                        color: #475569;
                        border: 1px solid transparent;
                        border-radius: 12px;
                        font-weight: 500;
                        transition: all 0.2s ease;
                    }
                    .gpa-chip-btn:hover {
                        background: #e2e8f0;
                        color: #0f172a;
                    }
                    .gpa-chip-btn.active {
                        background: #fff1f2;
                        color: var(--gpa-accent);
                        border-color: #fecdd3;
                        font-weight: 600;
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
                        border: 2px solid #f1f5f9;
                        background: #ffffff;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .target-gpa-box:hover {
                        border-color: #cbd5e1;
                        transform: translateY(-2px);
                    }
                    .target-gpa-box.active {
                        border-color: var(--gpa-accent);
                        background: var(--gpa-accent);
                        color: white;
                        box-shadow: 0 8px 20px -4px rgba(244, 63, 94, 0.3);
                    }
                    .target-gpa-box.active * {
                        color: white;
                    }
                    
                    /* Segmented Control (Toggle) */
                    .gpa-segmented-control {
                        display: inline-flex;
                        background: #f1f5f9;
                        padding: 4px;
                        border-radius: 14px;
                    }
                    .gpa-segment {
                        padding: 6px 16px;
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 600;
                        color: #64748b;
                        transition: all 0.2s ease;
                    }
                    .gpa-segment.active {
                        background: #ffffff;
                        color: #0f172a;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                    }

                    /* Steps */
                    .gpa-step-indicator {
                        width: 28px;
                        height: 28px;
                        border-radius: 50%;
                        background: #e0f2fe;
                        color: #0284c7;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 14px;
                        flex-shrink: 0;
                    }
                    
                    /* Tùy chỉnh thanh cuộn range */
                    .gpa-range {
                        -webkit-appearance: none;
                        width: 100%;
                        height: 8px;
                        background: #e2e8f0;
                        border-radius: 8px;
                        outline: none;
                    }
                    .gpa-range::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: var(--gpa-accent);
                        cursor: pointer;
                        border: 4px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                        transition: transform 0.1s;
                    }
                    .gpa-range::-webkit-slider-thumb:hover {
                        transform: scale(1.1);
                    }

                    /* Table */
                    .gpa-reference-table th {
                        background: #f8fafc;
                        color: #475569;
                        font-weight: 600;
                        font-size: 13px;
                        padding: 12px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .gpa-reference-table td {
                        padding: 12px;
                        font-size: 14px;
                        border-bottom: 1px solid #f1f5f9;
                        color: #334155;
                    }
                </style>

                <!-- Header Section -->
                <div class="text-center mb-10 mt-4">
                    <div class="inline-block relative mb-4">
                        <div class="w-20 h-20 bg-rose-50 rounded-2xl flex items-center justify-center rotate-3 shadow-sm border border-rose-100">
                            <i class="fas fa-stethoscope text-4xl text-rose-400 -rotate-3"></i>
                        </div>
                        <div class="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border border-gray-100">
                            <span class="text-rose-500 font-bold text-sm">4.0</span>
                        </div>
                    </div>
                    <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">GPA Calculator</h2>
                    <p class="text-slate-500 font-medium text-sm max-w-sm mx-auto">Công cụ tính điểm hệ 4 và lập chiến lược học tập dành riêng cho sinh viên UMP.</p>
                </div>

                <!-- Quick Conversion Card -->
                <section class="gpa-card p-6 sm:p-8 mb-8 relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-sky-400 to-indigo-500"></div>
                    
                    <div class="flex items-center gap-4 mb-6">
                        <div class="w-12 h-12 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center text-xl shrink-0">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-slate-800">Quy Đổi Nhanh</h3>
                            <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Tính điểm hệ 10 và điểm chữ tức thì.</p>
                        </div>
                    </div>

                    <form id="gpa-form">
                        <div class="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                            <div class="w-full">
                                <label for="correct-answers" class="block text-sm font-semibold text-slate-700 mb-2">Số câu đúng</label>
                                <input type="number" id="correct-answers" min="0" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-sky-600 text-center placeholder:text-slate-300"
                                    placeholder="35">
                            </div>
                            <div class="text-slate-300 text-4xl font-light hidden sm:block">/</div>
                            <div class="w-full">
                                <label for="total-questions" class="block text-sm font-semibold text-slate-700 mb-2">Tổng số câu</label>
                                <input type="number" id="total-questions" min="1" inputmode="numeric"
                                    class="gpa-input w-full px-5 py-4 text-3xl font-bold text-slate-700 text-center placeholder:text-slate-300"
                                    placeholder="50">
                            </div>
                        </div>
                        
                        <div id="total-quick-chips" class="flex flex-wrap items-center justify-center gap-2 mt-5">
                            <span class="text-xs font-semibold text-slate-400 mr-2 uppercase tracking-wider">Gợi ý</span>
                            <button type="button" data-total="30" class="gpa-chip-btn px-3 py-1.5 text-xs">30 câu</button>
                            <button type="button" data-total="40" class="gpa-chip-btn px-3 py-1.5 text-xs">40 câu</button>
                            <button type="button" data-total="50" class="gpa-chip-btn px-3 py-1.5 text-xs">50 câu</button>
                            <button type="button" data-total="60" class="gpa-chip-btn px-3 py-1.5 text-xs">60 câu</button>
                            <button type="button" data-total="100" class="gpa-chip-btn px-3 py-1.5 text-xs">100 câu</button>
                        </div>
                        
                        <button type="button" id="calculate-gpa-btn"
                            class="gpa-btn-primary w-full mt-6 py-4 text-[15px] flex items-center justify-center gap-2">
                            Quy Đổi Điểm
                            <i class="fas fa-arrow-right text-sm"></i>
                        </button>
                    </form>
                    
                    <div id="gpa-result-area" class="mt-6 hidden"></div>
                    
                    <details class="mt-6 group border border-slate-200 rounded-2xl overflow-hidden transition-all">
                        <summary class="cursor-pointer list-none flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
                            <span class="text-sm font-semibold text-slate-600 flex items-center gap-2">
                                <i class="fas fa-table text-slate-400"></i> Bảng quy đổi điểm chuẩn UMP
                            </span>
                            <i class="fas fa-chevron-down text-xs text-slate-400 transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div class="bg-white p-1 overflow-x-auto">
                            <table class="w-full text-center gpa-reference-table min-w-[300px]">
                                <thead>
                                    <tr>
                                        <th>Hệ 10</th>
                                        <th>Hệ 4</th>
                                        <th>Điểm Chữ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>9.5 – 10</td><td>4.0</td><td><span class="text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded">A+</span></td></tr>
                                    <tr><td>8.5 – 9.4</td><td>4.0</td><td><span class="text-rose-500 font-bold bg-rose-50 px-2 py-1 rounded">A</span></td></tr>
                                    <tr><td>8.0 – 8.4</td><td>3.5</td><td><span class="text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded">B+</span></td></tr>
                                    <tr><td>7.0 – 7.9</td><td>3.0</td><td><span class="text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded">B</span></td></tr>
                                    <tr><td>6.5 – 6.9</td><td>2.5</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded">C+</span></td></tr>
                                    <tr><td>5.5 – 6.4</td><td>2.0</td><td><span class="text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded">C</span></td></tr>
                                    <tr><td>5.0 – 5.4</td><td>1.5</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded">D+</span></td></tr>
                                    <tr><td>4.0 – 4.9</td><td>1.0</td><td><span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded">D</span></td></tr>
                                    <tr><td>&lt; 4.0</td><td>0.0</td><td><span class="text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded">F</span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>

                <!-- Strategy Card -->
                <section id="required-correct-section" class="gpa-card p-6 sm:p-8 mb-8 relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-rose-400 to-orange-400"></div>

                    <div class="flex items-center gap-4 mb-8">
                        <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center text-xl shrink-0">
                            <i class="fas fa-bullseye"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-lg font-bold text-slate-800">Chiến Lược Môn Học</h3>
                            <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Xác định số câu cần đúng cho các đợt thi.</p>
                        </div>
                        <button type="button" id="reset-goal-btn"
                            class="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shrink-0"
                            title="Làm mới">
                            <i class="fas fa-rotate-right"></i>
                        </button>
                    </div>

                    <!-- Subjects List (Tabs) -->
                    <div class="mb-8">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-sm font-semibold text-slate-700">Môn học đang theo dõi</span>
                            <div class="flex gap-1.5">
                                <button type="button" id="rename-subject-btn" class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors" title="Đổi tên môn"><i class="fas fa-pen text-[10px]"></i></button>
                                <button type="button" id="delete-subject-btn" class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 transition-colors" title="Xoá môn"><i class="fas fa-trash-can text-[10px]"></i></button>
                            </div>
                        </div>
                        <div id="subject-chips" class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                            <!-- JS render chips here -->
                        </div>
                    </div>

                    <!-- Semester GPA Summary -->
                    <details id="semester-gpa" class="group mb-8 rounded-2xl border border-teal-200 bg-teal-50/50 overflow-hidden">
                        <summary class="cursor-pointer list-none flex items-center gap-3 p-4 select-none hover:bg-teal-50 transition-colors">
                            <div class="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shrink-0 text-sm">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-sm font-bold text-teal-900">Tổng kết học kỳ</span>
                                <span id="semester-gpa-sub" class="text-xs font-medium text-teal-600 mt-0.5"></span>
                            </div>
                            <div class="ml-auto text-right">
                                <span id="semester-gpa-value" class="text-xl font-bold text-teal-700">—</span>
                            </div>
                            <i class="fas fa-chevron-down text-xs text-teal-500 ml-2 transition-transform group-open:rotate-180"></i>
                        </summary>
                        <div id="semester-gpa-body" class="p-4 pt-0 border-t border-teal-100 mt-1">
                            <!-- JS render -->
                        </div>
                    </details>

                    <!-- Step 1 -->
                    <div class="flex gap-4 mb-8 relative">
                        <div class="gpa-step-indicator">1</div>
                        <div class="flex-1">
                            <h4 class="text-sm font-bold text-slate-800 mb-3 mt-1">Cấu trúc kỳ thi</h4>
                            <select id="exam-type" class="gpa-input w-full px-4 py-3 text-sm font-medium text-slate-700 cursor-pointer">
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
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-3 mt-1 gap-3">
                                <h4 class="text-sm font-bold text-slate-800">Mục tiêu điểm số</h4>
                                <div id="target-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-target-mode="gpa4" class="target-mode-btn gpa-segment active">Hệ 4</button>
                                    <button type="button" data-target-mode="score10" class="target-mode-btn gpa-segment">Hệ 10</button>
                                </div>
                            </div>
                            
                            <input type="hidden" id="desired-gpa-4" value="4.0">
                            
                            <!-- Hệ 10 Input -->
                            <div id="desired-10-wrap" class="hidden bg-slate-50 rounded-xl p-5 border border-slate-100">
                                <div class="flex flex-col sm:flex-row items-center gap-5">
                                    <div class="flex items-center gap-3 w-full">
                                        <span class="text-sm font-medium text-slate-500 w-12">Điểm:</span>
                                        <input type="number" id="desired-score-10" min="0" max="10" step="0.1" inputmode="decimal" value="8.5"
                                            class="gpa-input w-20 px-2 py-2 text-center text-lg font-bold text-slate-800">
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
                                    <span class="text-base font-bold">D</span><span class="text-[11px] font-medium opacity-70">1.0</span>
                                </button>
                                <button type="button" data-gpa="1.5" class="gpa-chip target-gpa-box">
                                    <span class="text-base font-bold">D+</span><span class="text-[11px] font-medium opacity-70">1.5</span>
                                </button>
                                <button type="button" data-gpa="2.0" class="gpa-chip target-gpa-box">
                                    <span class="text-base font-bold">C</span><span class="text-[11px] font-medium opacity-70">2.0</span>
                                </button>
                                <button type="button" data-gpa="2.5" class="gpa-chip target-gpa-box">
                                    <span class="text-base font-bold">C+</span><span class="text-[11px] font-medium opacity-70">2.5</span>
                                </button>
                                <button type="button" data-gpa="3.0" class="gpa-chip target-gpa-box">
                                    <span class="text-base font-bold">B</span><span class="text-[11px] font-medium opacity-70">3.0</span>
                                </button>
                                <button type="button" data-gpa="3.5" class="gpa-chip target-gpa-box">
                                    <span class="text-base font-bold">B+</span><span class="text-[11px] font-medium opacity-70">3.5</span>
                                </button>
                                <button type="button" data-gpa="4.0" class="gpa-chip target-gpa-box active">
                                    <span class="text-base font-bold">A</span><span class="text-[11px] font-medium opacity-70">4.0</span>
                                </button>
                            </div>
                            
                            <p id="desired-target-hint" class="text-[13px] font-medium text-slate-600 bg-slate-50 border border-slate-100 p-3 rounded-xl mt-4 hidden"></p>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex gap-4 mb-2 relative">
                        <div class="gpa-step-indicator">3</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                                <h4 class="text-sm font-bold text-slate-800 mt-1">Thông số đợt thi</h4>
                                <div id="scale-mode-toggle" class="gpa-segmented-control self-start sm:self-auto">
                                    <button type="button" data-mode="ump" class="scale-mode-btn gpa-segment active">Khung UMP</button>
                                    <button type="button" data-mode="linear" class="scale-mode-btn gpa-segment">% tuyến tính</button>
                                </div>
                            </div>

                            <div id="attempts-table" class="space-y-3">
                                <!-- JS render inputs -->
                            </div>
                        </div>
                    </div>

                    <div id="gpa-live-projection" class="hidden"></div>
                    
                    <!-- Sticky Mobile Bar -->
                    <div id="gpa-sticky-bar" class="hidden sm:hidden sticky bottom-[5rem] z-20 mb-4 px-2">
                        <button type="button" id="gpa-sticky-btn"
                            class="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900/95 backdrop-blur-md shadow-2xl shadow-slate-900/30 active:scale-[0.98] transition-transform">
                            <div class="flex flex-col text-left">
                                <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tạm tính</span>
                                <span id="gpa-sticky-score" class="text-xl font-bold text-white">—</span>
                            </div>
                            <div class="flex-1 px-4 flex justify-end">
                                <span id="gpa-sticky-gap" class="text-xs text-rose-300 font-medium"></span>
                            </div>
                            <span class="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center">
                                <i class="fas fa-chevron-up text-xs"></i>
                            </span>
                        </button>
                    </div>

                    <button type="button" id="calculate-required-btn"
                        class="gpa-btn-primary w-full mt-8 py-4 text-[15px] flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-rose-400 hover:from-rose-600 hover:to-rose-500">
                        <i class="fas fa-magic text-sm"></i>
                        Phân Tích Chiến Lược
                    </button>
                    
                    <div id="required-correct-result" class="mt-6"></div>
                </section>
            </div>'''

# Replace exactly everything between <div id="gpaCalculatorContent" and the next </div></div> closing before libraryContent
pattern = re.compile(r'\s*<div id="gpaCalculatorContent".*?</section>\s*</div>\s*</div>', re.DOTALL)
if pattern.search(content):
    patched = pattern.sub('\n' + new_html, content)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(patched)
    print("Successfully replaced gpaCalculatorContent")
else:
    print("Pattern not found in index.html")
