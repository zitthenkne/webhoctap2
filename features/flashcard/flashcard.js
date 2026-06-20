import { db, auth } from '../../core/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';

function renderMath(element) {
    if (window.renderMathInElement && element) {
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false},
                    {left: "\\[", right: "\\[", display: true}
                ],
                throwOnError: false
            });
        } catch (err) {
            console.error("Lỗi render công thức KaTeX:", err);
        }
    } else if (element) {
        setTimeout(() => {
            if (window.renderMathInElement) {
                try {
                    window.renderMathInElement(element, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false},
                            {left: "\\(", right: "\\)", display: false},
                            {left: "\\[", right: "\\[", display: true}
                        ],
                        throwOnError: false
                    });
                } catch (err) {
                    console.error("Lỗi render công thức KaTeX sau khi chờ:", err);
                }
            }
        }, 200);
    }
}

// --- Lấy ID bộ đề từ URL ---
const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id');
const flashcardContainer = document.getElementById('flashcard-container');
const noteHint = document.getElementById('flashcard-note-hint');
let quizData = null;
let originalQuestions = [];
let _allFlashcardQuestions = [];
let flashcardQuestions = [];
let reviewQueue = [];
let currentFlashcardIndex = 0;

// Tải dữ liệu bộ đề
async function loadQuizData() {
    if (!quizId) {
        flashcardContainer.innerHTML = `<div class="text-center text-red-500">Lỗi: Không tìm thấy ID của bộ đề.</div>`;
        return;
    }
    try {
        const docRef = doc(db, "quiz_sets", quizId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            quizData = docSnap.data();
            originalQuestions = quizData.questions;
            startFlashcardMode(false);
        } else {
            flashcardContainer.innerHTML = `<div class="text-center text-red-500">Không tìm thấy bộ đề này.</div>`;
        }
    } catch (error) {
        flashcardContainer.innerHTML = `<div class="text-center text-red-500">Đã xảy ra lỗi khi tải dữ liệu.</div>`;
    }
}

function startFlashcardMode(shuffle = false) {
    if (!originalQuestions || originalQuestions.length === 0) {
        flashcardContainer.innerHTML = `<p class="text-red-500 text-center">Lỗi: Không có dữ liệu câu hỏi để tạo flashcard.</p>`;
        return;
    }
    _allFlashcardQuestions = originalQuestions.map((q, idx) => ({ ...q, _isKnown: false, _originalIndex: idx }));
    flashcardQuestions = [..._allFlashcardQuestions];
    if (shuffle) {
        for (let i = flashcardQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flashcardQuestions[i], flashcardQuestions[j]] = [flashcardQuestions[j], flashcardQuestions[i]];
        }
        showToast('Đã xáo trộn thứ tự thẻ!', 'info');
    }
    currentFlashcardIndex = 0;
    reviewQueue = [];
    renderFlashcards();
    addFlashcardKeyListeners();
}

function renderFlashcards() {
    flashcardContainer.innerHTML = `
        <div class="flashcard-viewer mx-auto max-w-2xl">
            <div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div id="flashcard-progress-bar" class="h-full bg-[#FF69B4] transition-all duration-300" style="width:0%"></div>
            </div>
            <div class="flex justify-between items-center mb-2 text-sm text-gray-600">
                <span id="flashcard-known-count"></span>
                <span id="flashcard-unknown-count"></span>
                <span id="flashcard-progress-percent" class="ml-auto font-bold"></span>
            </div>
            <div id="flashcard" class="flashcard-scene" title="Nhấn để lật thẻ (hoặc dùng phím Space)">
                <div class="flashcard-inner transition-transform duration-500">
                    <div id="flashcard-front" class="flashcard-face flashcard-front"></div>
                    <div id="flashcard-back" class="flashcard-face flashcard-back"></div>
                </div>
            </div>
            <div class="flex justify-between items-center mt-6">
                <button id="prev-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2" title="Phím ←">
                    <i class="fas fa-arrow-left"></i> Trước
                </button>
                <p id="card-progress" class="text-gray-600 font-medium"></p>
                <button id="next-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2" title="Phím →">
                    Sau <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <div id="mark-buttons" class="mt-4 flex justify-center gap-4 hidden">
                <button id="mark-known-btn" class="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2" title="Phím Enter">
                    <i class="fas fa-check"></i> Thuộc
                </button>
                <button id="mark-unknown-btn" class="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center gap-2" title="Phím U">
                    <i class="fas fa-times"></i> Chưa thuộc
                </button>
            </div>
            <div class="mt-4 flex justify-center items-center gap-3 text-sm text-gray-500">
                <kbd class="px-2 py-1 border rounded bg-gray-100">←</kbd> 
                <kbd class="px-2 py-1 border rounded bg-gray-100">→</kbd> để chuyển, 
                <kbd class="px-2 py-1 border rounded bg-gray-100">Space</kbd> để lật
                <span id="mark-keys-hint" class="hidden">, <kbd class="px-2 py-1 border rounded bg-gray-100">Enter</kbd> thuộc, <kbd class="px-2 py-1 border rounded bg-gray-100">U</kbd> chưa thuộc</span>
            </div>
            <div class="mt-8 border-t pt-6 flex justify-center flex-wrap gap-4">
                 <div class="flex flex-col items-center">
  <button id="shuffle-cards-btn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition flex items-center gap-2" title="Xáo trộn toàn bộ thẻ để học theo thứ tự mới">
    <i class="fas fa-random"></i> Xáo trộn
  </button>
  <span class="block md:hidden text-xs text-gray-600 mt-1">Xáo trộn toàn bộ thẻ để học lại theo thứ tự mới</span>
</div>
                </button>
                <div class="flex flex-col items-center">
  <button id="random-card-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition flex items-center gap-2" title="Chọn một thẻ bất kỳ để học ngay (không theo thứ tự)">
    <i class="fas fa-dice"></i> Ngẫu nhiên
  </button>
  <span class="block md:hidden text-xs text-gray-600 mt-1">Chọn một thẻ bất kỳ trong bộ để học nhanh</span>
</div>
                </button>
                <button id="restart-flashcards-btn" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2">
                    <i class="fas fa-redo"></i> Học lại lượt này
                </button>
                <button id="exit-flashcard-btn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition flex items-center gap-2">
                    <i class="fas fa-times-circle"></i> Thoát
                </button>
            </div>
        </div>
    `;
    // Session complete message (hidden by default)
    flashcardContainer.insertAdjacentHTML('beforeend', `
        <div id="flashcard-session-complete" class="hidden mt-8 p-6 bg-blue-100 text-blue-800 rounded-lg text-center">
            <h3 class="text-xl font-bold mb-3">Hoàn thành phiên học Flashcard!</h3>
            <p class="mb-4">Bạn đã ôn tập tất cả các thẻ.</p>
            <div class="flex justify-center gap-4">
                <button id="restart-all-flashcards-btn" class="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition">
                    <i class="fas fa-redo"></i> Học lại từ đầu
                </button>
                <button id="review-unknown-btn" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
                    <i class="fas fa-undo"></i> Xem lại thẻ chưa thuộc
                </button>
                <button id="exit-flashcard-final-btn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition">
                    <i class="fas fa-times-circle"></i> Thoát
                </button>
            </div>
        </div>
    `);
    // Gán sự kiện
    document.getElementById('flashcard').addEventListener('click', flipCard);
    document.getElementById('next-card-btn').addEventListener('click', () => moveToNextFlashcard(false));
    document.getElementById('prev-card-btn').addEventListener('click', showPrevCard);
    document.getElementById('shuffle-cards-btn').addEventListener('click', () => startFlashcardMode(true));
    document.getElementById('restart-flashcards-btn').addEventListener('click', () => startFlashcardMode(false));
    document.getElementById('exit-flashcard-btn').addEventListener('click', exitFlashcardMode);
    document.getElementById('mark-known-btn').addEventListener('click', () => markCard(true));
    document.getElementById('mark-unknown-btn').addEventListener('click', () => markCard(false));
    document.getElementById('restart-all-flashcards-btn').addEventListener('click', () => startFlashcardMode(false));
    document.getElementById('exit-flashcard-final-btn').addEventListener('click', exitFlashcardMode);
    showCard(currentFlashcardIndex);
}

function showCard(index) {
    const cardData = flashcardQuestions[index];
    const front = document.getElementById('flashcard-front');
    const back = document.getElementById('flashcard-back');
    const progress = document.getElementById('card-progress');
    const flashcardInner = document.querySelector('.flashcard-inner');
    const markButtons = document.getElementById('mark-buttons');
    const markKeysHint = document.getElementById('mark-keys-hint');
    const sessionCompleteMessage = document.getElementById('flashcard-session-complete');
    if (!front || !back || !progress || !flashcardInner || !markButtons || !markKeysHint || !sessionCompleteMessage) return;
    markButtons.classList.add('hidden');
    markKeysHint.classList.add('hidden');
    flashcardInner.classList.remove('is-flipped');
    front.innerHTML = `<p class="text-2xl font-semibold">${cardData.question}</p>`;
    renderMath(front);
    // Ghi chú cá nhân (localStorage)
    const noteKey = `flashcard_note_${quizId}_${index}`;
    let savedNote = localStorage.getItem(noteKey) || '';
    // Hiển thị đáp án, giải thích, và ô ghi chú
    const answerOptions = cardData.answers || cardData.options;
    if (!answerOptions || cardData.correctAnswerIndex === undefined || cardData.correctAnswerIndex === null) {
        back.innerHTML = `<p class="text-red-500">Lỗi dữ liệu thẻ.</p>`;
        progress.textContent = `Thẻ ${index + 1} / ${flashcardQuestions.length}`;
        return;
    }
    const correctAnswer = answerOptions[cardData.correctAnswerIndex];
    back.innerHTML = `
        <h4 class="font-bold text-xl text-green-600 mb-4">Đáp án: ${correctAnswer || 'N/A'}</h4>
        <p class="text-gray-700 mb-2">${cardData.explanation || 'Không có giải thích.'}</p>
        <textarea id="flashcard-note" class="w-full mt-2 p-2 border rounded bg-pink-50 text-gray-700" rows="2" placeholder="Ghi chú cá nhân...">${savedNote}</textarea>
        <div class="text-xs text-gray-400 mt-1">Ghi chú này chỉ lưu trên thiết bị của bạn.</div>
    `;
    renderMath(back);
    setTimeout(() => {
        const noteInput = document.getElementById('flashcard-note');
        if (noteInput) {
            noteInput.addEventListener('input', (e) => {
                localStorage.setItem(noteKey, e.target.value);
            });
        }
    }, 100);
    progress.textContent = `Thẻ ${index + 1} / ${flashcardQuestions.length}`;
    document.getElementById('prev-card-btn').disabled = index === 0;
    document.getElementById('next-card-btn').disabled = index === flashcardQuestions.length - 1;
    updateFlashcardProgress();
    setTimeout(() => {
        const markKnownBtn = document.getElementById('mark-known-btn');
        const markUnknownBtn = document.getElementById('mark-unknown-btn');
        const flashcardInner = document.querySelector('.flashcard-inner');
        if (markKnownBtn && flashcardInner) {
            markKnownBtn.addEventListener('click', () => {
                flashcardInner.classList.add('flash-success');
                setTimeout(() => flashcardInner.classList.remove('flash-success'), 600);
            });
        }
        if (markUnknownBtn && flashcardInner) {
            markUnknownBtn.addEventListener('click', () => {
                flashcardInner.classList.add('rumble');
                setTimeout(() => flashcardInner.classList.remove('rumble'), 400);
            });
        }
        const noteInput = document.getElementById('flashcard-note');
        if (noteInput && noteHint) {
            noteInput.addEventListener('focus', () => {
                noteHint.textContent = 'Bạn có thể ghi chú mẹo nhớ, ví dụ, hoặc bất cứ điều gì!';
                noteHint.classList.remove('hidden');
            });
            noteInput.addEventListener('blur', () => {
                noteHint.classList.add('hidden');
            });
        }
    }, 200);
}

function updateFlashcardProgress() {
    const progressBar = document.getElementById('flashcard-progress-bar');
    const knownCount = _allFlashcardQuestions.filter(q => q._isKnown).length;
    const unknownCount = _allFlashcardQuestions.length - knownCount;
    const knownSpan = document.getElementById('flashcard-known-count');
    const unknownSpan = document.getElementById('flashcard-unknown-count');
    const percent = _allFlashcardQuestions.length > 0 ? (knownCount / _allFlashcardQuestions.length) * 100 : 0;
    if (progressBar) progressBar.style.width = percent + '%';
    if (knownSpan) knownSpan.textContent = `Đã thuộc: ${knownCount}`;
    if (unknownSpan) unknownSpan.textContent = `Chưa thuộc: ${unknownCount}`;
    const percentSpan = document.getElementById('flashcard-progress-percent');
    if (percentSpan) percentSpan.textContent = `${percent.toFixed(0)}%`;
}

function flipCard() {
    const flashcardInner = document.querySelector('.flashcard-inner');
    const markButtons = document.getElementById('mark-buttons');
    const markKeysHint = document.getElementById('mark-keys-hint');
    if (!flashcardInner || !markButtons || !markKeysHint) return;
    flashcardInner.classList.toggle('is-flipped');
    if (flashcardInner.classList.contains('is-flipped')) {
        markButtons.classList.remove('hidden');
        markKeysHint.classList.remove('hidden');
    } else {
        markButtons.classList.add('hidden');
        markKeysHint.classList.add('hidden');
    }
}

function markCard(isKnown) {
    const currentCard = flashcardQuestions[currentFlashcardIndex];
    const originalCardIndex = _allFlashcardQuestions.findIndex((q) => q._originalIndex === currentCard._originalIndex);
    if (originalCardIndex !== -1) _allFlashcardQuestions[originalCardIndex]._isKnown = isKnown;
    if (!isKnown && !reviewQueue.includes(currentCard)) {
        reviewQueue.push(currentCard);
    }
    updateFlashcardProgress();
    moveToNextFlashcard(true);
}

function moveToNextFlashcard(marked = false) {
    if (currentFlashcardIndex < flashcardQuestions.length - 1) {
        currentFlashcardIndex++;
        showCard(currentFlashcardIndex);
    } else {
        showSessionComplete();
    }
}

function showPrevCard() {
    if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        showCard(currentFlashcardIndex);
    }
}

function showSessionComplete() {
    const sessionCompleteMessage = document.getElementById('flashcard-session-complete');
    if (sessionCompleteMessage) sessionCompleteMessage.classList.remove('hidden');
}

function exitFlashcardMode() {
    window.location.href = `../quiz/quiz.html?id=${quizId}`;
}

function addFlashcardKeyListeners() {
    document.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.id === 'flashcard-note') return;
        if (e.code === 'Space') {
            e.preventDefault();
            flipCard();
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            moveToNextFlashcard(false);
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            showPrevCard();
        } else if (e.code === 'Enter') {
            e.preventDefault();
            if (document.querySelector('.flashcard-inner.is-flipped')) markCard(true);
        } else if (e.key.toLowerCase() === 'u') {
            e.preventDefault();
            if (document.querySelector('.flashcard-inner.is-flipped')) markCard(false);
        }
    });
}

let viewMode = 'normal'; // 'normal', 'grid', 'quickreview'
let searchKeyword = '';
let selectedTopic = 'all';

function getAllTopics() {
    if (!originalQuestions) return [];
    const topics = originalQuestions.map(q => q.topic || 'Chung');
    return Array.from(new Set(topics));
}

function filterQuestions() {
    let filtered = [...originalQuestions];
    if (selectedTopic !== 'all') {
        filtered = filtered.filter(q => (q.topic || 'Chung') === selectedTopic);
    }
    if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        filtered = filtered.filter(q =>
            (q.question && q.question.toLowerCase().includes(kw)) ||
            ((q.answers && q.answers.join(' ').toLowerCase().includes(kw)) || (q.options && q.options.join(' ').toLowerCase().includes(kw)))
        );
    }
    return filtered;
}

function renderViewModeSwitcher() {
    const switcher = document.getElementById('view-mode-switch');
    if (!switcher) return;
    switcher.querySelectorAll('button').forEach(btn => btn.classList.remove('ring', 'ring-2'));
    if (viewMode === 'normal') document.getElementById('mode-normal-btn').classList.add('ring', 'ring-2', 'ring-pink-400');
    if (viewMode === 'grid') document.getElementById('mode-grid-btn').classList.add('ring', 'ring-2', 'ring-blue-400');
    if (viewMode === 'quickreview') document.getElementById('mode-quickreview-btn').classList.add('ring', 'ring-2', 'ring-green-400');
}

function renderFilterBar() {
    const topics = getAllTopics();
    let html = `<div class="flex flex-wrap gap-2 items-center mb-4 justify-center">
        <select id="topic-filter" class="border rounded px-2 py-1 text-sm">
            <option value="all">Tất cả chủ đề</option>
            ${topics.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <input id="search-input" class="border rounded px-2 py-1 text-sm" placeholder="Tìm kiếm từ khóa..." value="${searchKeyword}">
    </div>`;
    return html;
}

function renderGridView() {
    const filtered = filterQuestions();
    flashcardContainer.innerHTML = renderFilterBar() + `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">` +
        filtered.map((q, idx) => `
            <div class="bg-white rounded-lg shadow p-3 flex flex-col items-center cursor-pointer transition hover:scale-105" onclick="window.renderSingleCard(${idx})">
                <div class="font-bold text-pink-700 text-center mb-2">${q.question}</div>
                <div class="text-xs text-gray-500 mb-1">${q.topic || 'Chung'}</div>
                <button class="mt-auto px-2 py-1 text-xs bg-pink-100 text-pink-700 rounded">Xem chi tiết</button>
            </div>
        `).join('') + '</div>';
    bindFilterEvents();
    renderMath(flashcardContainer);
}

window.renderSingleCard = function(idx) {
    viewMode = 'normal';
    currentFlashcardIndex = idx;
    renderAll();
};

function renderQuickReviewView() {
    const filtered = filterQuestions();
    flashcardContainer.innerHTML = renderFilterBar() + `<div class="flex flex-col gap-4 max-w-2xl mx-auto">` +
        filtered.map(q => `
            <div class="bg-white rounded-lg shadow p-4 flex flex-col">
                <div class="font-bold text-pink-700 mb-2">${q.question}</div>
                <div class="text-green-700">${q.answers && q.answers.length ? q.answers[0] : (q.options && q.options[q.correctAnswerIndex] || '')}</div>
                <div class="text-xs text-gray-400 mt-1">${q.topic || 'Chung'}</div>
            </div>
        `).join('') + '</div>';
    bindFilterEvents();
    renderMath(flashcardContainer);
}

function bindFilterEvents() {
    const topicSel = document.getElementById('topic-filter');
    if (topicSel) topicSel.value = selectedTopic;
    if (topicSel) topicSel.onchange = e => { selectedTopic = e.target.value; renderAll(); };
    const searchInp = document.getElementById('search-input');
    if (searchInp) searchInp.oninput = e => { searchKeyword = e.target.value; renderAll(); };
}

function renderAll() {
    renderViewModeSwitcher();
    if (viewMode === 'normal') {
        flashcardQuestions = filterQuestions().map((q, idx) => ({ ...q, _isKnown: false, _originalIndex: idx }));
        renderFlashcards();
    } else if (viewMode === 'grid') {
        renderGridView();
    } else if (viewMode === 'quickreview') {
        renderQuickReviewView();
    }
}

document.getElementById('mode-normal-btn').onclick = () => { viewMode = 'normal'; renderAll(); };
document.getElementById('mode-grid-btn').onclick = () => { viewMode = 'grid'; renderAll(); };
document.getElementById('mode-quickreview-btn').onclick = () => { viewMode = 'quickreview'; renderAll(); };

document.addEventListener('DOMContentLoaded', loadQuizData);


// Hiện mô tả ngắn dưới nút khi bấm icon info trên mobile
function showInfoBelowBtn(btnElem, message) {
    // Xóa mô tả cũ nếu có
    document.querySelectorAll('.info-desc-mobile').forEach(el => el.remove());
    // Tạo mô tả mới
    const desc = document.createElement('div');
    desc.className = 'info-desc-mobile';
    desc.style.background = '#fff8e1';
    desc.style.color = '#444';
    desc.style.fontSize = '0.98rem';
    desc.style.borderRadius = '10px';
    desc.style.boxShadow = '0 2px 8px #FFD6E0';
    desc.style.marginTop = '6px';
    desc.style.padding = '8px 14px';
    desc.style.textAlign = 'center';
    desc.style.maxWidth = '90vw';
    desc.style.position = 'static';
    desc.style.zIndex = '999';
    desc.textContent = message;
    btnElem.parentNode.insertBefore(desc, btnElem.nextSibling);
    // Tự động ẩn sau 2.5s
    setTimeout(() => desc.remove(), 2500);
    // Ẩn khi bấm ra ngoài
    function hideOnClick(e) {
        if (!desc.contains(e.target) && e.target !== btnElem) {
            desc.remove();
            document.removeEventListener('touchstart', hideOnClick);
            document.removeEventListener('mousedown', hideOnClick);
        }
    }
    document.addEventListener('touchstart', hideOnClick);
    document.addEventListener('mousedown', hideOnClick);
}
// Gán sự kiện cho icon info
setTimeout(() => {
    document.querySelectorAll('.info-icon').forEach(icon => {
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            showInfoBelowBtn(icon.parentNode, icon.getAttribute('data-info'));
        });
    });
}, 300);


