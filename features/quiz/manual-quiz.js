// manual-quiz.js - Advanced editor-like manual quiz
// Implements dynamic editing, option control, explanations, reordering, cute theme, toasts

document.addEventListener('DOMContentLoaded', () => {
    const editorContainer = document.getElementById('editor-container');
    const toast = window.showToast || ((msg, type) => alert(msg));
    let quizData = {
        title: '',
        questions: []
    };

    function renderQuestions() {
        // Render the form and questions area inside editorContainer
        editorContainer.innerHTML = `
            <form id="manualQuizForm" class="flex flex-col gap-4">
                <input type="text" id="quizTitle" class="cute-input font-semibold" placeholder="Tên bộ trắc nghiệm" value="${quizData.title || ''}" required>
                <div id="questionsContainer" class="flex flex-col gap-6"></div>
                <button type="button" id="addQuestionBtn" class="cute-add-btn add-question-btn self-center mt-2"><i class="fas fa-plus"></i> Thêm câu hỏi</button>
            </form>
        `;
        const questionsContainer = document.getElementById('questionsContainer');
        if (!quizData.questions.length) {
            addQuestion();
            return;
        }
        quizData.questions.forEach((q, idx) => {
            if (!Array.isArray(q.optionExplanations)) {
                q.optionExplanations = [];
            }
            while (q.optionExplanations.length < q.options.length) {
                q.optionExplanations.push('');
            }

            const div = document.createElement('div');
            div.className = 'cute-card bg-pink-50 border-2 border-pink-200 rounded-xl p-4 shadow flex flex-col gap-3 mb-4 question-block';
            div.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-[#FF69B4]">Câu hỏi ${idx + 1}</span>
                    <div class="flex gap-2">
                        <button type="button" class="cute-btn bg-white text-[#FF69B4] border hover:bg-pink-50 move-up-btn" title="Lên"><i class="fas fa-arrow-up"></i></button>
                        <button type="button" class="cute-btn bg-white text-[#FF69B4] border hover:bg-pink-50 move-down-btn" title="Xuống"><i class="fas fa-arrow-down"></i></button>
                        <button type="button" class="cute-btn bg-white text-red-400 border hover:bg-red-100 delete-question-btn" title="Xóa"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <input type="text" class="cute-input question-title" placeholder="Nhập nội dung câu hỏi" value="${q.question || ''}" required>
                <div class="flex flex-col gap-3">
                    ${q.options.map((opt, oidx) => {
                        const optExp = (q.optionExplanations && q.optionExplanations[oidx]) || '';
                        const isCorrect = q.answer === oidx;
                        const placeholderText = isCorrect ? "Giải thích tại sao đúng (tùy chọn)" : "Giải thích tại sao sai (tùy chọn)";
                        return `
                        <div class="flex flex-col gap-1 p-2 bg-white/50 border border-pink-100 rounded-lg">
                            <div class="flex items-center gap-2">
                                <input type="text" class="cute-input answer-input flex-1" placeholder="Đáp án ${String.fromCharCode(65+oidx)}" value="${opt}" required>
                                <input type="radio" name="correct-${idx}" class="correct-radio" ${isCorrect ? 'checked' : ''} title="Chọn là đáp án đúng">
                                <button type="button" class="cute-btn bg-white text-red-400 border hover:bg-red-100 delete-answer-btn" title="Xóa đáp án"><i class="fas fa-times"></i></button>
                            </div>
                            <div class="pl-2">
                                <input type="text" class="cute-input option-exp-input text-xs py-1" value="${optExp}" placeholder="${placeholderText}" />
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
                <button type="button" class="cute-btn bg-[#FF69B4] text-white add-answer-btn mt-2"><i class="fas fa-plus"></i> Thêm đáp án</button>
                <textarea class="cute-textarea explanation-input mt-2" rows="2" placeholder="Giải thích (không bắt buộc)">${q.explanation || ''}</textarea>
            `;
            // Question title
            div.querySelector('.question-title').addEventListener('input', e => {
                quizData.questions[idx].question = e.target.value;
            });
            // Move up
            div.querySelector('.move-up-btn').onclick = () => {
                if (idx > 0) {
                    [quizData.questions[idx-1], quizData.questions[idx]] = [quizData.questions[idx], quizData.questions[idx-1]];
                    renderQuestions();
                }
            };
            // Move down
            div.querySelector('.move-down-btn').onclick = () => {
                if (idx < quizData.questions.length-1) {
                    [quizData.questions[idx+1], quizData.questions[idx]] = [quizData.questions[idx], quizData.questions[idx+1]];
                    renderQuestions();
                }
            };
            // Delete question
            div.querySelector('.delete-question-btn').onclick = () => {
                quizData.questions.splice(idx,1);
                renderQuestions();
            };
            // Answer inputs
            div.querySelectorAll('.answer-input').forEach((input, oidx) => {
                input.addEventListener('input', e => {
                    quizData.questions[idx].options[oidx] = e.target.value;
                });
            });
            // Option explanations
            div.querySelectorAll('.option-exp-input').forEach((input, oidx) => {
                input.addEventListener('input', e => {
                    if (!Array.isArray(quizData.questions[idx].optionExplanations)) {
                        quizData.questions[idx].optionExplanations = [];
                    }
                    quizData.questions[idx].optionExplanations[oidx] = e.target.value;
                });
            });
            // Correct answer
            div.querySelectorAll('.correct-radio').forEach((radio, oidx) => {
                radio.addEventListener('change', e => {
                    quizData.questions[idx].answer = oidx;
                    renderQuestions(); // update checked
                });
            });
            // Delete answer
            div.querySelectorAll('.delete-answer-btn').forEach((btn, oidx) => {
                btn.onclick = () => {
                    if (quizData.questions[idx].options.length <= 2) {
                        toast('Mỗi câu hỏi cần ít nhất 2 đáp án!', 'warning');
                        return;
                    }
                    quizData.questions[idx].options.splice(oidx,1);
                    if (Array.isArray(quizData.questions[idx].optionExplanations)) {
                        quizData.questions[idx].optionExplanations.splice(oidx,1);
                    }
                    if (quizData.questions[idx].answer >= quizData.questions[idx].options.length) {
                        quizData.questions[idx].answer = 0;
                    }
                    renderQuestions();
                };
            });
            // Add answer
            div.querySelector('.add-answer-btn').onclick = () => {
                quizData.questions[idx].options.push('');
                if (!Array.isArray(quizData.questions[idx].optionExplanations)) {
                    quizData.questions[idx].optionExplanations = [];
                }
                quizData.questions[idx].optionExplanations.push('');
                renderQuestions();
            };
            // Explanation
            div.querySelector('.explanation-input').addEventListener('input', e => {
                quizData.questions[idx].explanation = e.target.value;
            });
            questionsContainer.appendChild(div);
        });
        attachFormEvents();
    }

    function addQuestion() {
        quizData.questions.push({
            question: '',
            options: ['', ''],
            optionExplanations: ['', ''],
            answer: 0,
            explanation: ''
        });
        renderQuestions();
    }

    // Attach events after DOM is ready and after render
    function attachFormEvents() {
        const addQuestionBtn = document.getElementById('addQuestionBtn');
        const manualQuizForm = document.getElementById('manualQuizForm');
        if (addQuestionBtn) addQuestionBtn.onclick = addQuestion;
        if (manualQuizForm) {
            manualQuizForm.onsubmit = (e) => {
                e.preventDefault();
                quizData.title = document.getElementById('quizTitle').value.trim();
                if (!quizData.title) {
                    toast('Vui lòng nhập tên bộ trắc nghiệm!', 'warning');
                    return;
                }
                if (!quizData.questions.length) {
                    toast('Hãy thêm ít nhất một câu hỏi!', 'warning');
                    return;
                }
                for (const [i, q] of quizData.questions.entries()) {
                    if (!q.question.trim() || q.options.some(opt => !opt.trim())) {
                        toast(`Điền đầy đủ thông tin cho câu hỏi ${i+1}!`, 'warning');
                        return;
                    }
                }
                // Save to localStorage
                localStorage.setItem('manualQuizDraft', JSON.stringify(quizData));
                toast('Bộ đề đã được lưu!', 'success');
            };
        }
    }

    // Initial render
    renderQuestions();
    attachFormEvents();
});
