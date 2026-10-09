// File: features/quiz/page/quiz-session.js
// Vòng đời một PHIÊN làm bài: tải dữ liệu bộ đề, bắt đầu/khôi phục phiên, đồng hồ đếm giờ,
// nộp bài (endQuiz), luyện tập lại câu sai và đọc cấu hình từ trang thiết lập.
// Tách từ quiz-page.js — logic giữ nguyên.

import { db, auth } from '../../../core/firebase-init.js';
import { whenAuthReady } from '../../../core/auth-session.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { showToast } from '../../../core/utils.js';
import { applyLocalQuestionEdits } from '../quiz-editor.js';
import { getOfflineQuiz, autoCacheQuiz, within, isOfflineSavedSync, saveOfflineQuiz, extractQuizImageUrls, cacheQuizImages, touchOfflineQuiz } from '../quiz-offline-store.js';
import { LOCAL_FRESH_MS, localStillCurrent, stampBeforeFetch, takeStamp } from '../quiz-fresh.js';
import { state, saveQuizState, clearQuizState, saveQuizResult, updateQuizResultScore, markQuizStateFinished } from '../quiz-state.js';
import { shuffleArray, shuffleQuestionOptions, isAnswerCorrect, sessionScore } from '../quiz-helpers.js';
import { isEssay, isPendingEssay, withAutoGrade } from '../quiz-essay-core.js';
import { showSubmitQuizBtn, loadQuizDetails, showResults, toggleFocusMode } from '../quiz-ui.js';
import { getVibrate, sfx } from './quiz-page-prefs.js';
import { pullStudyFromCloud, whenStudyPulled, currentQuizId } from './quiz-study-sync.js';
import { buildSrsQueue } from '../quiz-srs-store.js';
import { groupQuestionsByCase, tagCaseSequence } from './quiz-cases.js';
import { showQuestion, accrueTime } from './quiz-question-view.js';
import { hideMobileNav } from './quiz-mobile-nav.js';

let autoSaveInterval = null;

// Biến trang thiết lập thành card lỗi rõ ràng (icon + thông điệp + Thử lại / Về trang chủ)
// thay vì kẹt ở "Đang tải thông tin..." với tiêu đề "Lỗi" khô khan.
function showLandingError(message, { showRetry = true } = {}) {
    const landing = document.getElementById('quiz-landing');
    if (!landing) return;
    landing.innerHTML = `
        <div class="py-8 flex flex-col items-center text-center gap-4">
            <div class="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-2xl">
                <i class="fas fa-triangle-exclamation"></i>
            </div>
            <h1 class="text-xl font-extrabold text-gray-700">Không tải được bộ đề</h1>
            <p class="text-sm text-gray-500 max-w-sm">${message}</p>
            <div class="flex flex-wrap gap-3 justify-center mt-2">
                ${showRetry ? `<button type="button" id="landing-retry-btn" class="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-[#FF69B4] text-white rounded-xl font-bold text-sm shadow hover:scale-[1.03] active:scale-[0.97] transition"><i class="fas fa-rotate-right"></i> Thử lại</button>` : ''}
                <a href="../../index.html" class="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition"><i class="fas fa-home"></i> Về trang chủ</a>
            </div>
        </div>`;
    const retryBtn = document.getElementById('landing-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
    // Nút "Bắt đầu ngay" gốc đã bị gỡ cùng landing -> ẩn luôn thanh bắt đầu nổi (mobile),
    // vì IntersectionObserver không bắn lại khi phần tử theo dõi rời DOM.
    const mobileBar = document.getElementById('mobile-start-bar');
    if (mobileBar) mobileBar.classList.remove('show');
    document.title = 'Không tải được bộ đề';
}

// LOCAL_FRESH_MS / so dấu updatedAt: xem ../quiz-fresh.js (dùng chung với flashcard, lịch sử)

// Tải trước hình ảnh trong câu hỏi vào CacheStorage để khi tắt mạng ảnh vẫn hiển thị
function prefetchQuizImages(questions) {
    if (!Array.isArray(questions)) return;
    cacheQuizImages(questions).catch((e) => console.warn('Lỗi prefetch ảnh:', e));
}

// Tự động tải lưu offline hoàn chỉnh vào IndexedDB và nạp cache ảnh ngầm
async function autoSaveAndNotify(quizId, data) {
    if (!data || !Array.isArray(data.questions) || !data.questions.length) return;
    const wasSaved = isOfflineSavedSync(quizId);
    const imgUrls = extractQuizImageUrls(data.questions);

    try {
        await saveOfflineQuiz(quizId, data, { auto: false });

        // Cập nhật giao diện nút tải offline
        const btn = document.getElementById('offline-download-btn');
        const icon = document.getElementById('offline-download-icon');
        const label = document.getElementById('offline-download-label');
        if (btn) btn.classList.add('is-saved');
        if (icon) icon.className = 'fas fa-check text-emerald-500';
        if (label) label.textContent = 'Đã tải offline';
        if (btn) btn.title = 'Bộ đề đã được lưu về máy. Bấm để cập nhật bản mới nhất.';

        // Báo cho người dùng biết để có thể tắt mạng/5G nếu là lần đầu tải về máy
        if (!wasSaved) {
            const imgNote = imgUrls.length > 0 ? ` (kèm ${imgUrls.length} ảnh minh họa)` : '';
            showToast(`Đã tải xong bộ đề về máy${imgNote}! Bạn có thể tắt mạng để làm bài nhé.`, 'success', 5000);
        }
    } catch (e) {
        console.warn('Lỗi tự động lưu offline bộ đề:', e);
    }
}

function setupOfflineDownloadBtn(quizId) {
    const btn = document.getElementById('offline-download-btn');
    if (!btn) return;
    const icon = document.getElementById('offline-download-icon');
    const label = document.getElementById('offline-download-label');

    const updateStatus = () => {
        const isOffline = !navigator.onLine;
        const isSaved = isOfflineSavedSync(quizId);

        btn.classList.toggle('is-saved', isSaved);
        btn.classList.toggle('is-offline', isOffline);

        if (isOffline) {
            if (icon) icon.className = 'fas fa-plane text-amber-500';
            if (label) label.textContent = isSaved ? 'Đang ngoại tuyến' : 'Mất mạng';
            btn.title = isSaved ? 'Đang học ngoại tuyến bằng bản lưu trên máy.' : 'Mất mạng và chưa có bản tải về.';
        } else if (isSaved) {
            if (icon) icon.className = 'fas fa-check text-emerald-500';
            if (label) label.textContent = 'Đã tải offline';
            btn.title = 'Bộ đề đã được lưu về máy. Bấm để cập nhật bản mới nhất.';
        } else {
            if (icon) icon.className = 'fas fa-arrow-down';
            if (label) label.textContent = 'Tải offline';
            btn.title = 'Tải bộ đề về máy để làm bài khi không có mạng.';
        }
    };

    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    btn.onclick = async () => {
        if (!state.quizData || !state.quizData.questions) {
            showToast('Dữ liệu bộ đề đang tải, vui lòng chờ chút nhé...', 'info');
            return;
        }

        const isSaved = isOfflineSavedSync(quizId);
        const imgUrls = extractQuizImageUrls(state.quizData.questions);
        try {
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            if (label) label.textContent = imgUrls.length > 0 ? `Đang tải ảnh (0/${imgUrls.length})...` : 'Đang lưu...';
            btn.disabled = true;

            const saved = await saveOfflineQuiz(quizId, state.quizData, {
                auto: false,
                cacheImages: true,
                onProgress: (done, total) => {
                    if (label && total > 0) label.textContent = `Tải ảnh ${done}/${total}...`;
                }
            });

            btn.disabled = false;
            updateStatus();
            const imgNote = saved.imgFailed ? ` (${saved.imgFailed}/${imgUrls.length} ảnh chưa tải được, bấm lại khi mạng ổn để tải nốt)` : imgUrls.length > 0 ? ` (kèm ${imgUrls.length} ảnh minh họa)` : '';
            showToast(isSaved ? `Đã cập nhật bản offline mới nhất${imgNote}!` : `Đã tải bộ đề về máy${imgNote}! Bạn có thể tắt mạng để làm bài nhé.`, saved.imgFailed ? 'warning' : 'success', 5000);
        } catch (e) {
            console.error('Lỗi lưu offline:', e);
            btn.disabled = false;
            updateStatus();
            showToast('Không thể lưu offline: ' + (e.message || 'Lỗi bộ nhớ'), 'error');
        }
    };
}

export async function loadQuizData() {
    const urlParams = new URLSearchParams(window.location.search);
    const quizId = urlParams.get('id');

    if (!quizId) {
        showLandingError('Đường dẫn không có ID bộ đề. Hãy mở lại bộ đề từ thư viện nhé.', { showRetry: false });
        return;
    }

    setupOfflineDownloadBtn(quizId);

    // Dùng bộ đề (từ IndexedDB hoặc Firestore) để nạp vào state và hiển thị trang chờ
    const applyQuizData = (data) => {
        state.quizData = data;
        state.quizData.id = quizId;
        applyLocalQuestionEdits();
        state.originalQuestions = state.quizData.questions;
        loadQuizDetails();
        pullStudyFromCloud(quizId);
        setupOfflineDownloadBtn(quizId);
    };

    // 1. KIỂM TRA BẢN LƯU TRONG MÁY (INDEXEDDB) ĐẦU TIÊN (Tải tức thì ~5-15ms)
    // Bất kể online hay offline: nếu máy đã có bản lưu, render trang chờ NGAY LẬP TỨC!
    let localData = null;
    try {
        localData = await getOfflineQuiz(quizId);
        if (localData && Array.isArray(localData.questions) && localData.questions.length > 0) {
            applyQuizData(localData);
            prefetchQuizImages(localData.questions);
        } else {
            localData = null;
        }
    } catch (e) {
        console.warn('Lỗi đọc bản lưu cục bộ:', e);
        localData = null;
    }

    // 2. NẾU NGOẠI TUYẾN:
    if (!navigator.onLine) {
        if (localData) {
            showToast('Đang học ngoại tuyến bằng bản đã tải về máy.', 'info');
            return;
        }
        showLandingError('Bạn đang ngoại tuyến và bộ đề này chưa được tải về máy.');
        return;
    }

    // 3. NẾU ĐANG CÓ MẠNG (ONLINE):
    // - Nếu ĐÃ CÓ bản local: chạy ngầm (Stale-While-Revalidate) mà không chặn giao diện.
    // - Nếu CHƯA CÓ bản local (lần đầu tiên mở bộ đề): await fetch từ Firestore để nạp lần đầu.
    const isPlayingNow = () => document.body.classList.contains('quiz-active') ||
        (document.getElementById('quiz-container') && !document.getElementById('quiz-container').classList.contains('hidden'));
    const ageOf = (rec) => Date.now() - (Number(rec._offlineSavedAt) || 0);

    let noticedStamp = null;        // bản mới đã báo "đang làm bài" rồi thì khỏi báo lại
    // Hỏi máy chủ xem bộ đề có bản mới không (dấu `updateTime` ~1 KB, xem quiz-fresh.js); có thì tải cả bộ về, lưu máy, và cập nhật trang chờ.
    // `announce`: đã có bản máy hiện trên màn -> nói cho người dùng biết khi bản mới thay vào.
    const refreshOnce = async ({ announce = false, force = false } = {}) => {
        try {
            const cur = force ? localData : (await getOfflineQuiz(quizId)) || localData;
            if (!force && cur && ageOf(cur) < LOCAL_FRESH_MS) return;            // vừa xác nhận xong, khỏi hỏi lại
            if (cur && await localStillCurrent(quizId, cur)) { touchOfflineQuiz(quizId); return; }
            // dấu máy chủ: lấy từ lượt hỏi vừa rồi, hoặc hỏi NGAY (trước getDoc) — để dấu không bao giờ mới hơn nội dung tải về
            const known = takeStamp(quizId);
            const stampP = known ? Promise.resolve(known) : stampBeforeFetch(quizId);
            const docRef = doc(db, "quiz_sets", quizId);
            const remotePromise = getDoc(docRef);
            // Nếu chưa có dữ liệu thì chờ tối đa 6 giây; nếu đã có bản local rồi thì chờ thoải mái ở nền
            let docSnap;
            try {
                docSnap = localData ? await remotePromise : await within(remotePromise, 6000);
            } catch (err) {
                if (err && (err.code === 'permission-denied' || err.message?.includes('permission-denied'))) {
                    if (!localData) {
                        showLandingError('Bộ đề này được đặt ở chế độ riêng tư. Vui lòng đăng nhập đúng tài khoản tác giả để làm bài.', { showRetry: true });
                        return;
                    }
                }
                throw err;
            }

            if (docSnap && docSnap.exists()) {
                const remoteData = docSnap.data();
                remoteData.id = quizId;

                // Bản C3: bộ cũ CHƯA có dấu updatedAt → chủ bộ đề ghi bù MỘT lần (dấu = bây giờ, gán luôn vào bản máy sắp lưu để hai bên khớp ngay).
                // Chỉ chủ ghi được (luật); lỗi ghi → máy khác cứ tải đủ như trước.
                // (Ghi bù làm updateTime của doc nhảy -> dấu ta vừa lấy cũ đi MỘT nấc: lần mở sau tải lại đúng một lần rồi ổn.)
                if (!remoteData.updatedAt && auth.currentUser && remoteData.userId === auth.currentUser.uid) {
                    const stamp = new Date();
                    remoteData.updatedAt = stamp;
                    updateDoc(docRef, { updatedAt: stamp }).catch(() => {});
                }

                // Tách Vỏ - Ruột: nếu quiz_sets chỉ chứa metadata (hoặc questions rỗng),
                // tải tiếp payload câu hỏi từ quiz_payloads
                if (!Array.isArray(remoteData.questions) || remoteData.questions.length === 0) {
                    try {
                        const payloadSnap = await getDoc(doc(db, "quiz_payloads", quizId));
                        if (payloadSnap && payloadSnap.exists()) {
                            const pData = payloadSnap.data();
                            if (Array.isArray(pData.questions)) {
                                remoteData.questions = pData.questions;
                            }
                        }
                    } catch (pErr) {
                        console.warn("Không thể tải payload questions từ quiz_payloads:", pErr);
                    }
                }

                // Lưu bản máy kèm dấu máy chủ để lần sau chỉ cần hỏi dấu
                const srvStamp = await stampP;
                if (srvStamp) remoteData._srvTime = srvStamp;

                // Tự động tải lưu offline hoàn chỉnh vào IndexedDB và nạp cache ảnh ngầm
                autoSaveAndNotify(quizId, remoteData);
                const hadLocal = !!localData;
                localData = remoteData;

                // Chưa bấm bắt đầu (đang ở trang chờ) -> thay bản mới vào luôn (đề phòng tác giả vừa sửa bài).
                // Đang làm dở -> KHÔNG đổi câu hỏi giữa chừng (đáp án đang chọn gắn theo vị trí câu); bản máy đã mới cho lần sau.
                if (!isPlayingNow()) {
                    applyQuizData(remoteData);
                    if (hadLocal && announce) showToast('Đã cập nhật bộ đề: bản mới vừa được tải về.', 'success', 3500);
                } else if (srvStamp !== noticedStamp) {
                    noticedStamp = srvStamp;
                    showToast('Bộ đề vừa có bản mới. Bài đang làm giữ nguyên, lần làm sau sẽ dùng bản mới.', 'info', 5000);
                }
            } else if (!localData) {
                showLandingError('Không tìm thấy bộ đề này. Có thể nó đã bị xóa hoặc đường dẫn không đúng.', { showRetry: true });
            }
        } catch (error) {
            console.warn("Lỗi tải/cập nhật dữ liệu từ cloud:", error);
            if (!localData) {
                if (error && (error.code === 'permission-denied' || error.message?.includes('permission-denied'))) {
                    showLandingError('Bộ đề này được đặt ở chế độ riêng tư. Vui lòng đăng nhập đúng tài khoản tác giả để làm bài.', { showRetry: true });
                    return;
                }
                // Thử lại lần cuối xem IndexedDB có gì không
                const fallback = await getOfflineQuiz(quizId);
                if (fallback && Array.isArray(fallback.questions) && fallback.questions.length > 0) {
                    applyQuizData(fallback);
                    showToast('Mạng chậm — đang dùng bản đã tải về máy.', 'info');
                    return;
                }
                showLandingError('Có lỗi khi tải dữ liệu từ máy chủ (mạng chập chờn) và bộ đề này chưa được lưu offline.', { showRetry: true });
            }
        }
    };
    let refreshing = null, lastTry = 0;
    const refresh = (opts) => {
        if (refreshing) return refreshing;
        lastTry = Date.now();
        return (refreshing = refreshOnce(opts).finally(() => { refreshing = null; }));
    };

    // Trang ĐANG MỞ cũng tự nhận bản mới (trước đây chỉ kiểm lúc mở trang): quay lại tab / ứng dụng, có mạng lại, hoặc ở yên trang chờ ≥ 2 phút.
    // refreshOnce tự bỏ qua nếu bản máy vừa được xác nhận (< LOCAL_FRESH_MS); lỗi mạng thì nghỉ 5s mới thử lại.
    const watchForUpdates = () => {
        const check = () => {
            if (!navigator.onLine || document.visibilityState !== 'visible' || refreshing || Date.now() - lastTry < 5000) return;
            refresh({ announce: true });
        };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', () => setTimeout(check, 1000));
        window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
        setInterval(() => { if (!isPlayingNow()) check(); }, 120000);
    };
    watchForUpdates();

    if (localData) {
        // Đã hiện UI tức thì từ IndexedDB rồi! Cho kiểm tra chạy ngầm ở background, không await chặn UI.
        // Bản trong máy vừa được xác nhận chưa tới LOCAL_FRESH_MS (20s) -> khỏi hỏi lại; quá hạn thì hỏi dấu ~1 KB (xem quiz-fresh.js).
        refresh({ announce: true });
    } else {
        // Chưa có bản lưu nào thì cần đảm bảo Auth đã khôi phục phiên trước khi đọc bộ đề riêng tư
        await whenAuthReady(3500);
        await refresh({ force: true });
    }
}

export function startQuizMode(questionsArray, mode = 'normal', restoreState = null) {
    if (mode === 'normal' || mode === 'practice' || mode === 'srs') {
        showSubmitQuizBtn(true);
    } else {
        showSubmitQuizBtn(false);
    }
    state.quizMode = mode;
    state.questions = questionsArray;
    // Bảo đảm thông tin thứ tự câu trong ca lâm sàng luôn có mặt cho mọi đường vào
    // (luyện tập lại, khôi phục bài làm dở...), không chỉ riêng startQuizWithCurrentSettings.
    tagCaseSequence(state.questions);

    const quizLanding = document.getElementById('quiz-landing');
    const quizContainer = document.getElementById('quiz-container');
    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');

    if (!state.questions || state.questions.length === 0) {
        quizContainer.innerHTML = `<p class="text-red-500">Lỗi: Không có dữ liệu câu hỏi để bắt đầu.</p>`;
        return;
    }

    if (restoreState) {
        state.currentIndex = restoreState.currentIndex || 0;
        state.userAnswers = restoreState.userAnswers || new Array(state.questions.length).fill(null);
        state.score = restoreState.score || 0;
        state.markedQuestions = restoreState.markedQuestions || [];
        state.markedReasons = restoreState.markedReasons || {};
        state.eliminatedAnswers = restoreState.eliminatedAnswers || {};
        state.confidence = restoreState.confidence || {};
        state.questionTimes = restoreState.questionTimes || new Array(state.questions.length).fill(0);
        state.quizStartTime = restoreState.quizStartTime ? new Date(restoreState.quizStartTime) : new Date();
        // Khôi phục cả trợ giúp 50:50, chuỗi đúng và lựa chọn tạm của câu nhiều đáp án
        // -> quay lại đúng hiện trạng, không "hoàn lại" 50:50 đã dùng.
        state.used5050Questions = restoreState.used5050Questions || {};
        state.multiSelections = restoreState.multiSelections || {};
        state.streak = restoreState.streak || 0;
        state.caseSeen = restoreState.caseSeen || {};
    } else {
        state.caseSeen = {};
        state.currentIndex = 0;
        state.userAnswers = new Array(state.questions.length).fill(null);
        state.score = 0;
        state.quizStartTime = new Date();
        state.markedQuestions = [];
        state.markedReasons = {};
        state.streak = 0;
        state.used5050Questions = {};
        state.eliminatedAnswers = {};
        state.confidence = {};
        state.questionTimes = new Array(state.questions.length).fill(0);
    }
    state._timingIndex = null;
    state._timingEnterAt = 0;

    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    if (state.quizOptions.isTimed) {
        let totalSeconds = 0;
        if (state.quizOptions.timedMinutes && !isNaN(state.quizOptions.timedMinutes)) {
            totalSeconds = state.quizOptions.timedMinutes * 60;
        }
        // Khôi phục bài dở: đếm tiếp phần giờ CÒN LẠI, không phát lại đủ giờ
        if (restoreState && restoreState.timeLeft > 0) totalSeconds = restoreState.timeLeft;
        startTimer(totalSeconds);
    } else {
        state.timeLeft = null;
    }

    quizLanding.classList.add('hidden');
    quizLanding.classList.remove('quiz-landing-leaving');
    // Thanh "Bắt đầu" nổi (điện thoại) đang hiện thì IntersectionObserver KHÔNG bắn lại khi nút gốc
    // bị ẩn (ngoài màn -> vẫn ngoài màn) -> vào bằng "Ôn ngay"/Enter/tiếp bài dở là thanh kẹt đè bài làm.
    document.getElementById('mobile-start-bar')?.classList.remove('show');
    // Đánh dấu tab này đang làm bài đề này -> tải lại trang (F5) thì vào thẳng câu đang làm (quiz.html đầu trang)
    try { sessionStorage.setItem('quizLive', (state.quizData && state.quizData.id) || new URLSearchParams(location.search).get('id') || ''); } catch (e) {}
    quizContainer.classList.remove('hidden');
    // Khởi động lại hiệu ứng "vào màn" mỗi lần bắt đầu (kể cả khi làm lại từ kết quả)
    quizContainer.classList.remove('quiz-enter');
    void quizContainer.offsetWidth; // ép trình duyệt reflow để animation chạy lại
    quizContainer.classList.add('quiz-enter');
    quizSection.innerHTML = '';
    resultsSection.innerHTML = '';
    quizSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    showQuestion();
    saveQuizState();
    // Tải lại trang (F5) giữa lúc đang tập trung → vào lại vẫn tập trung (cờ do page/quiz-focus.js ghi, xóa khi tắt/nộp bài)
    try {
        if (!state.focusMode) {
            if (restoreState) { if (sessionStorage.getItem('quizFocus') === '1') toggleFocusMode(true, true); }
            else if (localStorage.getItem('quiz_focus_auto') === '1' || localStorage.getItem('quiz_focus_q_' + currentQuizId()) === '1') toggleFocusMode(false, true);   // công tắc "Tự tập trung khi bắt đầu" HOẶC lần trước bộ đề này đang ở tập trung
        }
    } catch (e) { }

    // Tự động lưu định kỳ để không mất tiến độ (ghi chú, đáp án...) nếu trình duyệt đóng đột ngột
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection && !resultsSection.classList.contains('hidden')) return;
        saveQuizState();
    }, 15000);
}

export function endQuiz() {
    showSubmitQuizBtn(false);
    // #11: chốt thời gian của câu cuối cùng đang xem
    accrueTime();
    state._timingIndex = null;
    const hud = document.getElementById('quiz-hud');
    if (hud) hud.style.display = 'none';
    // Ẩn thanh điều hướng đáy (mobile) + đóng bảng nhảy câu khi rời màn làm bài
    hideMobileNav();
    // Rời màn làm bài -> ẩn nhóm điều khiển làm bài trong bảng thiết lập
    document.body.classList.remove('quiz-active');
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (state.focusMode) {
        toggleFocusMode(false, true);   // nộp bài tự thoát: không đổi lựa chọn "bộ đề này làm ở chế độ tập trung"
    }

    // LUÔN chấm lại điểm từ userAnswers: "Xem đáp án ngay" giờ bật/tắt được giữa chừng
    // (bảng Ngựa thì chỉnh) nên bộ đếm dồn state.score không còn đáng tin — các câu trả
    // lời trong lúc chế độ đang tắt không được cộng điểm lúc bấm.
    // Câu tự luận chưa chấm -> máy chấm sơ bộ theo từ khóa (người làm xem lại ở màn kết quả)
    state.userAnswers = state.userAnswers.map((a, i) => withAutoGrade(state.questions[i], a));
    rescore();

    markQuizStateFinished();
    try { sessionStorage.removeItem('quizLive'); } catch (e) {}

    let totalTime = 0;
    if (state.quizStartTime) {
        totalTime = Math.floor((new Date() - state.quizStartTime) / 1000);
    }
    stopTimer();   // dừng + ẩn đồng hồ (trước chỉ dừng -> viên giờ đứng im trên màn kết quả)

    state._resultsTime = totalTime;
    renderResults(totalTime);

    if (state.quizMode === 'normal') {
        const r = savedScore();
        saveQuizResult(r.score, r.total, r.pct, totalTime);
    }

    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');
    quizSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    // Ẩn hai cột bên hông (số câu / ghi chú) ở màn kết quả để dồn về 1 cột
    const navPanel = document.getElementById('quiz-nav-panel');
    const notePanel = document.getElementById('quiz-note-panel');
    if (navPanel) navPanel.classList.add('hidden');
    if (notePanel) notePanel.classList.add('hidden');
    const workspace = document.getElementById('quiz-workspace');
    if (workspace) workspace.classList.add('results-active');

    // Tự động cuộn lên đầu trang để xem kết quả ngay từ đầu
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Tổng điểm = tổng điểm từng câu × trọng số câu (tự luận tính theo tỉ lệ barem, xem quiz-essay-core.js)
function rescore() {
    state.score = sessionScore(state.questions, state.userAnswers).score;
}
// quiz_results lưu điểm QUY VỀ SỐ CÂU (score/totalQuestions = % thật) vì thống kê, chip tiến bộ,
// thư viện đều tính % bằng score/totalQuestions — có trọng số câu thì điểm thô sẽ lệch.
function savedScore() {
    const total = state.questions.length;
    const { pct } = sessionScore(state.questions, state.userAnswers);
    return { score: Math.round(pct * total) / 100, total, pct };
}

function renderResults(totalTime, opts) {
    showResults(totalTime, opts);
    // Nút của màn kết quả được dựng lại mỗi lần vẽ -> gắn lại sự kiện
    document.getElementById('restartQuizBtn')?.addEventListener('click', () => startQuizWithCurrentSettings());
    document.getElementById('practiceIncorrectBtn')?.addEventListener('click', startIncorrectPracticeMode);
}

// Tự chấm câu tự luận ở màn kết quả -> tính lại điểm, vẽ lại tại chỗ (giữ câu đang mở, bộ lọc, vị trí cuộn)
// rồi cập nhật bản kết quả đã lưu.
export function refreshResults() {
    rescore();
    const list = document.getElementById('detailed-results-list');
    const before = [...(list ? list.querySelectorAll('.result-item') : [])];
    const openIdx = before.map((it, i) => (it.querySelector('.result-body:not(.hidden)') ? i : -1)).filter(i => i >= 0);
    const shownIdx = before.map((it, i) => (it.classList.contains('hidden') ? -1 : i)).filter(i => i >= 0);
    const filter = document.querySelector('#result-filter-tabs .result-filter-btn.bg-pink-500')?.getAttribute('data-filter');
    const y = window.scrollY;
    renderResults(state._resultsTime || 0, { instant: true });
    if (filter && filter !== 'all') document.querySelector(`#result-filter-tabs [data-filter="${filter}"]`)?.click();
    const items = document.querySelectorAll('#detailed-results-list .result-item');
    // Câu vừa chấm xong không còn khớp bộ lọc "Chưa chấm" -> vẫn giữ trên màn để tick tiếp
    if (filter && filter !== 'all') shownIdx.forEach(i => items[i]?.classList.remove('hidden'));
    openIdx.forEach(i => items[i]?.querySelector('.result-header')?.click());
    window.scrollTo(0, y);
    if (state.quizMode === 'normal') {
        const r = savedScore();
        updateQuizResultScore(r.score, r.total, r.pct);
    }
}

export function startIncorrectPracticeMode() {
    // Câu tự luận chưa tự chấm không tính là sai
    const incorrectQuestions = state.questions.filter((q, index) => !isAnswerCorrect(q, state.userAnswers[index]) && !isPendingEssay(q, state.userAnswers[index]));
    if (incorrectQuestions.length > 0) {
        startQuizMode(incorrectQuestions, 'practice');
    } else {
        showToast("Chúc mừng! Bạn không có câu nào sai.", 'success');
    }
}

function formatTimeLocal(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

export function startTimer(totalSeconds) {
    if (!totalSeconds) return;
    const timerDisplay = document.getElementById('timerDisplay');
    if (!timerDisplay) return;
    timerDisplay.classList.remove('hidden');
    timerDisplay.textContent = formatTimeLocal(totalSeconds);
    clearPauseUi();
    timerDisplay.title = 'Bấm để tạm dừng (phím P)';
    let warnedOneMin = totalSeconds <= 60;   // tiếp tục sau tạm dừng khi chỉ còn <1 phút thì khỏi báo lại "Còn 1 phút"
    // Đếm theo MỐC KẾT THÚC chứ không đếm nhịp: tab chạy nền bị trình duyệt hãm setInterval vẫn đúng giờ.
    // (Bản cũ vừa elapsed++ vừa totalSeconds-- mỗi nhịp -> đồng hồ chạy GẤP ĐÔI, 30 phút hết sau 15 phút.)
    const endAt = Date.now() + totalSeconds * 1000;
    state.timeLeft = totalSeconds;
    clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        state.timeLeft = remaining;   // saveQuizState lưu lại -> tải lại trang / làm tiếp không được cộng giờ
        timerDisplay.textContent = formatTimeLocal(remaining);
        // #5: cảnh báo sắp hết giờ (đổi màu + rung)
        if (remaining <= 10 && remaining > 0) {
            timerDisplay.classList.add('timer-critical');
            timerDisplay.classList.remove('timer-warn');
            sfx('timerTick', { remaining });   // 10 giây cuối: tích tắc cao dần
            if (remaining <= 5 && getVibrate() && navigator.vibrate) navigator.vibrate(40);
        } else if (remaining <= 60 && remaining > 10) {
            timerDisplay.classList.add('timer-warn');
            if (!warnedOneMin) {
                warnedOneMin = true;
                sfx('timerWarn');
                if (getVibrate() && navigator.vibrate) navigator.vibrate([30, 40, 30]);
                showToast('Còn 1 phút!', 'info');
            }
        }
        if (remaining <= 0) {
            timerDisplay.classList.remove('timer-warn', 'timer-critical');
            clearInterval(state.quizTimerInterval);
            sfx('timeUp');
            showToast('Hết giờ! Bài sẽ được nộp tự động.', 'info');
            setTimeout(() => {
                endQuiz();
            }, 1000);
            return;
        }
    }, 1000);
}

// --- TẠM DỪNG đồng hồ (bài tính giờ): phím P hoặc bấm vào đồng hồ. Câu hỏi bị màn che ẩn (không "nghỉ để nghĩ"),
// giờ làm từng câu cũng dừng; tiếp tục = đếm tiếp đúng số giây còn lại. ---
let pausedLeft = null;
function clearPauseUi() {
    pausedLeft = null;
    document.body.classList.remove('quiz-paused');
    document.getElementById('pause-veil')?.remove();
    document.getElementById('timerDisplay')?.classList.remove('timer-paused');
}
export function isTimerPaused() { return pausedLeft !== null; }
export function pauseTimer() {
    if (pausedLeft !== null || !state.quizTimerInterval) return false;
    pausedLeft = state.timeLeft;
    clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = null;
    accrueTime();
    state._timingEnterAt = 0;   // thời gian đứng im không tính vào thời gian làm câu
    document.body.classList.add('quiz-paused');
    document.getElementById('timerDisplay')?.classList.add('timer-paused');
    const veil = document.createElement('div');
    veil.id = 'pause-veil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('aria-label', 'Đã tạm dừng');
    veil.innerHTML = `
        <i class="fas fa-pause pv-ic" aria-hidden="true"></i>
        <p class="pv-title">Đã tạm dừng</p>
        <p class="pv-time">${formatTimeLocal(pausedLeft)}</p>
        <p class="pv-sub">Đồng hồ dừng ở đây. Câu hỏi được ẩn trong lúc tạm dừng.</p>
        <button type="button" class="pv-go"><i class="fas fa-play"></i> Tiếp tục</button>`;
    document.body.appendChild(veil);
    veil.querySelector('.pv-go').addEventListener('click', resumeTimer);
    veil.querySelector('.pv-go').focus();
    sfx('ui');
    saveQuizState();
    return true;
}
export function resumeTimer() {
    if (pausedLeft === null) return;
    const left = pausedLeft;
    clearPauseUi();
    if (state._timingIndex !== null) state._timingEnterAt = Date.now();
    startTimer(left);
    sfx('ui');
}
export function togglePause() { return pausedLeft !== null ? (resumeTimer(), false) : pauseTimer(); }

// Tắt đồng hồ đếm ngược giữa chừng (công tắc "Tính giờ" trong bảng Ngựa thì chỉnh)
export function stopTimer() {
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = null;
    state.timeLeft = null;
    clearPauseUi();
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.classList.add('hidden');
        timerDisplay.classList.remove('timer-warn', 'timer-critical');
    }
}

export function startQuizWithCurrentSettings() {
    clearQuizState();
    state.streak = 0;
    state.used5050Questions = {};

    // Gắn chỉ số gốc (__origIdx) cho từng câu để khi người dùng chỉnh sửa trong lúc làm bài
    // còn ánh xạ ngược về đúng câu trong dữ liệu gốc (kể cả khi đã trộn câu/đáp án).
    let selectedQuestions = state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i }));

    // Gom các câu cùng ca lâm sàng (caseId) thành "khối" để không bị xé lẻ khi trộn/cắt số câu.
    // Câu không có caseId là khối kích thước 1.
    let caseBlocks = groupQuestionsByCase(selectedQuestions);

    const shuffleCheckbox = document.getElementById('shuffle-questions-checkbox');
    if (shuffleCheckbox && shuffleCheckbox.checked) {
        // Trộn ở mức KHỐI: thứ tự các ca bị xáo, nhưng câu con trong mỗi ca giữ nguyên thứ tự.
        caseBlocks = shuffleArray(caseBlocks);
    }

    const enableCountCheckbox = document.getElementById('enable-question-count-checkbox');
    const countInput = document.getElementById('question-count-input');
    if (enableCountCheckbox && enableCountCheckbox.checked && countInput) {
        const countVal = parseInt(countInput.value);
        if (!isNaN(countVal) && countVal > 0) {
            // Cắt theo ranh giới khối: gom đủ khối cho tới khi đạt số câu yêu cầu, không cắt ngang một ca.
            const limitedBlocks = [];
            let total = 0;
            for (const block of caseBlocks) {
                if (total >= countVal) break;
                limitedBlocks.push(block);
                total += block.length;
            }
            caseBlocks = limitedBlocks;
        }
    }

    selectedQuestions = caseBlocks.flat();
    // Gán thứ tự câu trong ca (__caseSeq / __caseTotal / __caseFirst) sau khi đã chốt thứ tự cuối.
    tagCaseSequence(selectedQuestions);

    // Xáo trộn thứ tự đáp án trong từng câu (sau khi đã chọn/cắt số câu)
    const shuffleAnswersCheckbox = document.getElementById('shuffle-answers-checkbox');
    if (shuffleAnswersCheckbox && shuffleAnswersCheckbox.checked) {
        selectedQuestions = selectedQuestions.map(q => shuffleQuestionOptions(q));
    }

    const timedCheckbox = document.getElementById('timed-mode-checkbox');
    const timedInput = document.getElementById('timed-minutes-input');
    state.quizOptions.isTimed = timedCheckbox && timedCheckbox.checked;
    state.quizOptions.timedMinutes = timedInput ? parseInt(timedInput.value) : 0;

    const showAnswerCheckbox = document.getElementById('show-answer-immediately-checkbox');
    state.quizOptions.showAnswerImmediately = showAnswerCheckbox && showAnswerCheckbox.checked;

    showSubmitQuizBtn(true);
    startQuizMode(selectedQuestions, 'normal');
}

// Bắt đầu phiên ÔN NGẮT QUÃNG: hàng đợi = câu đến hạn + câu mới trong quota ngày
// (xem quiz-srs-store.js). Luôn hiện đáp án ngay (cần biết đúng/sai để chấm lịch),
// không tính giờ. Trả về (Promise) false nếu hôm nay không còn gì để ôn.
export async function startSrsSession() {
    // Firestore là nguồn chính: chờ bản kéo cloud đầu tiên hợp nhất vào local
    // (timeout 4s — mạng chậm/khách thì dùng local) rồi mới tính hàng đợi,
    // để máy mới không coi toàn bộ câu đã học là "câu mới".
    await whenStudyPulled();
    clearQuizState();
    state.streak = 0;
    state.used5050Questions = {};
    state.quizOptions.isTimed = false;
    state.quizOptions.timedMinutes = 0;
    state.quizOptions.showAnswerImmediately = true;

    // Ôn ngắt quãng chấm đúng/sai ngay lúc trả lời -> không hợp câu tự luận (tự chấm theo ý)
    const base = state.originalQuestions.map((q, i) => ({ ...q, __origIdx: i })).filter(q => !isEssay(q));
    const { queue, dueCount, newCount } = buildSrsQueue(
        currentQuizId(), base, { title: state.quizData && state.quizData.title }
    );
    if (!queue.length) {
        showToast('Hôm nay không có câu nào đến hạn ôn. Quay lại sau nhé!', 'info');
        return false;
    }

    let questions = queue;
    const shuffleAnswersCheckbox = document.getElementById('shuffle-answers-checkbox');
    if (shuffleAnswersCheckbox && shuffleAnswersCheckbox.checked) {
        questions = questions.map(q => shuffleQuestionOptions(q));
    }

    state._srsSessionInfo = { dueCount, newCount };
    startQuizMode(questions, 'srs');
    return true;
}
