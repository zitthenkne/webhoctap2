// room-scoreboard.js — chấm điểm, bảng xếp hạng realtime và màn tổng kết phiên.
// Điểm được TÍNH LẠI từ dữ liệu (đáp án của từng người + mốc mở câu), không lưu riêng
// -> ai vào sau, ai F5, ai mất mạng rồi vào lại đều thấy đúng cùng một bảng.
import { room, correctIdxOf, optsOf, answerOf, canControl, isAnnounced, betOf, teamOn, teamOf } from './room-state.js';
import { TEAM_NAMES, participationHtml } from './room-game.js';
import { avatarHtml, escapeHtml, shortName, changed } from './room-ui.js';

const BASE_POINT = 100;      // đúng là có
const SPEED_POINT = 60;      // thưởng thêm tối đa nếu bấm sớm
const STREAK_POINT = 10;     // mỗi câu đúng liên tiếp, tối đa 5 bậc
const DEFAULT_WINDOW = 30000;

function windowMs() {
    const t = room.session?.timerSec;
    return t ? t * 1000 : DEFAULT_WINDOW;
}

function startOf(i) {
    const qs = room.session?.qStarts || {};
    return qs['q' + i] || room.session?.startedAtMs || 0;
}

/** Điểm + thống kê của từng thành viên, đã sắp xếp giảm dần. */
// Chỉ chấm những câu chủ trì ĐÃ CHỐT — đáp án trong file chỉ là tham khảo,
// nên trước khi chốt thì không ai có điểm và cũng không lộ ai đang đúng.
const isScored = (i) => isAnnounced(i);

export function computeScores() {
    const questions = room.session?.questions || [];
    const rows = room.members.map(m => {
        let points = 0, correct = 0, answered = 0, streak = 0, best = 0, sumMs = 0, timed = 0, bigWin = 0;
        questions.forEach((q, i) => {
            if (!isScored(i)) return;
            const a = answerOf(m, i);
            if (!a) { streak = 0; return; }
            answered++;
            const c = correctIdxOf(q, i);
            if (c === null || c === undefined) return;
            const bet = betOf(m, i);                 // cược tự tin ×1 / ×2 / ×3
            if (a.i === c) {
                correct++;
                streak++;
                best = Math.max(best, streak);
                const t0 = startOf(i);
                const dt = t0 ? Math.max(0, a.at - t0) : windowMs();
                if (t0) { sumMs += dt; timed++; }
                const speed = Math.round(SPEED_POINT * Math.max(0, 1 - dt / windowMs()));
                points += (BASE_POINT + speed + STREAK_POINT * Math.min(streak - 1, 5)) * bet;
                if (bet > 1) bigWin++;
            } else {
                points -= 5 * (bet - 1);                 // dám cược thì dám mất
                streak = 0;
            }
        });
        return {
            uid: m.uid, member: m, name: m.displayName || 'Khách',
            points, correct, answered, best, bigWin, team: teamOf(m),
            avgMs: timed ? sumMs / timed : null,
        };
    });
    rows.sort((a, b) => b.points - a.points || b.correct - a.correct || (a.avgMs ?? 9e9) - (b.avgMs ?? 9e9));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
}

/** Phân bố lựa chọn của cả phòng cho câu thứ i. */
export function questionStats(i) {
    const q = room.session?.questions?.[i];
    const counts = optsOf(q).map(() => 0);
    let total = 0;
    room.members.forEach(m => {
        const a = answerOf(m, i);
        if (a && typeof a.i === 'number' && a.i < counts.length) { counts[a.i]++; total++; }
    });
    const c = correctIdxOf(q, i);
    return { counts, total, correctIdx: c, correctCount: (c === null || c === undefined) ? 0 : counts[c] || 0 };
}

let showAllStats = false;
export const toggleAllStats = () => { showAllStats = !showAllStats; };
const MEDAL = ['🥇', '🥈', '🥉'];

/** Bảng xếp hạng ở panel bên phải. */
/** Bảng so kè 2 đội — chỉ hiện khi chủ trì bật chia đội. */
export function teamStripHtml(rows) {
    if (!teamOn()) return '';
    const sum = (t) => rows.filter(r => r.team === t).reduce((n, r) => n + Math.max(0, r.points), 0);
    const a = sum('A');
    const b = sum('B');
    const tot = a + b || 1;
    const dan = a === b ? 'Hoà nhau' : `${TEAM_NAMES[a > b ? 'A' : 'B']} dẫn ${Math.abs(a - b)} điểm`;
    return `<div class="rm-teams">
        <div class="rm-teams-head">
            <span class="rm-team-chip tA on">${TEAM_NAMES.A} · ${a}</span>
            <span class="rm-hint flex-1 text-center">${dan}</span>
            <span class="rm-team-chip tB on">${TEAM_NAMES.B} · ${b}</span>
        </div>
        <div class="rm-teams-bar"><span class="tA" style="width:${Math.round(100 * a / tot)}%"></span><span class="tB" style="width:${Math.round(100 * b / tot)}%"></span></div>
    </div>`;
}

export function renderRankPanel() {
    const el = document.getElementById('panel-rank');
    if (!el) return;
    // Đóng thì thôi — computeScores() quét cả phòng × cả đề, không nên chạy nền.
    if (el.classList.contains('hidden')) return;
    if (!changed('rank', [room.session?.chosen, room.session?.questions?.length,
        room.members.map(m => [m.uid, m.displayName, m.emoji, m.answers])])) return;
    if (!room.session?.questions?.length) {
        el.innerHTML = `<div class="text-center text-muted py-10">
            <i class="fas fa-trophy text-3xl mb-2 opacity-30"></i>
            <p class="text-sm font-semibold">Chưa có phiên nào</p>
            <p class="text-xs mt-1">Điểm chỉ tính ở những câu nhóm đã chốt.</p></div>`;
        return;
    }
    const rows = computeScores();
    const total = room.session.questions.length;
    el.innerHTML = `
        ${teamStripHtml(rows)}
        <p class="rm-label mb-2">Xếp hạng · chỉ tính câu đã chốt</p>
        <div class="space-y-1.5">${rows.map(r => `
            <div class="rm-member ${r.uid === room.user?.uid ? 'me' : ''}">
                <span class="w-6 text-center font-black ${r.rank <= 3 ? 'text-base' : 'text-xs text-muted'}">${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</span>
                ${avatarHtml(r.member, 'sm')}
                <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-bold truncate">${escapeHtml(shortName(r.name, 18))}</p>
                    <p class="text-[10px] text-muted">${r.correct}/${total} đúng${r.best > 1 ? ` · chuỗi ${r.best}` : ''}</p>
                </div>
                <span class="text-sm font-black tabular-nums" style="color:var(--rm-accent)">${r.points}</span>
            </div>`).join('')}</div>`;
}

/** Màn tổng kết cuối phiên (mọi người đều thấy). */
export function renderResults() {
    const el = document.getElementById('quiz-result');
    if (!el || !room.session) return;
    const questions = room.session.questions || [];
    const rows = computeScores().filter(r => r.answered > 0);
    const podium = rows.slice(0, 3);
    const stats = questions.map((q, i) => ({ i, q, ...questionStats(i) }));
    const graded = stats.filter(s => s.total > 0 && s.correctIdx !== null && s.correctIdx !== undefined);
    const hardest = graded.slice().sort((a, b) => (a.correctCount / a.total) - (b.correctCount / b.total))[0];
    const roomAcc = graded.length
        ? Math.round(100 * graded.reduce((s, x) => s + x.correctCount / x.total, 0) / graded.length) : 0;

    el.innerHTML = `
        <div class="text-center mb-5">
            <div class="text-4xl mb-2">🎉</div>
            <h2 class="text-2xl font-extrabold">Kết thúc phiên</h2>
            <p class="text-sm text-muted mt-1">${escapeHtml(room.session.quizTitle || 'Đề trắc nghiệm')} · ${questions.length} câu · cả phòng đúng trung bình <b class="text-[#FF69B4]">${roomAcc}%</b></p>
        </div>

        ${teamStripHtml(rows)}

        ${podium.length ? `<div class="rm-podium">${
            [1, 0, 2].filter(i => podium[i]).map(i => {
                const r = podium[i];
                return `<div class="rm-pod rm-pod-${r.rank} ${r.member?.uid === room.user?.uid ? 'is-me' : ''}">
                    <div class="rm-pod-top">
                        <span class="rm-pod-medal">${MEDAL[r.rank - 1]}</span>
                        ${avatarHtml(r.member, 'lg')}
                    </div>
                    <div class="rm-pod-bar"><b>${r.points}</b><span>${r.correct} câu đúng</span></div>
                    <p class="rm-pod-name">${escapeHtml(shortName(r.name, 14))}</p>
                </div>`;
            }).join('')}</div>` : ''}

        ${(() => {
            const me = rows.find(r => r.member?.uid === room.user?.uid);
            if (!me) return '';
            const acc = me.answered ? Math.round(100 * me.correct / me.answered) : 0;
            return `<div class="rm-mecard">
                <div class="rm-mecard-head">${avatarHtml(me.member, 'lg')}
                    <div class="min-w-0">
                        <p class="rm-label">Kết quả của bạn</p>
                        <p class="text-lg font-extrabold truncate">Hạng ${me.rank}/${rows.length} · ${me.points} điểm</p>
                    </div>
                </div>
                <div class="rm-mestats">
                    <div><b>${me.correct}/${me.answered}</b><span>câu trúng</span></div>
                    <div><b>${acc}%</b><span>độ chính xác</span></div>
                    <div><b>${me.best}</b><span>chuỗi dài nhất</span></div>
                    <div><b>${questions.length - me.answered}</b><span>câu bỏ trống</span></div>
                </div>
            </div>`;
        })()}

        <div class="rm-panel overflow-hidden mb-5">
            <table class="rm-table">
                <thead>
                    <tr><th class="py-2 px-3 text-left">#</th><th class="text-left">Thành viên</th><th class="text-center">Đúng</th><th class="text-center">Chuỗi</th><th class="text-right px-3">Điểm</th></tr>
                </thead>
                <tbody>${rows.map(r => `
                    <tr>
                        <td class="font-bold text-muted">${r.rank}</td>
                        <td class="font-bold truncate">${escapeHtml(shortName(r.name, 22))}</td>
                        <td class="text-center tabular-nums">${r.correct}/${questions.length}</td>
                        <td class="text-center tabular-nums">${r.best}</td>
                        <td class="text-right font-black tabular-nums" style="color:var(--rm-accent)">${r.points}</td>
                    </tr>`).join('') || '<tr><td colspan="5" class="py-4 text-center text-muted">Chưa có câu nào được chốt.</td></tr>'}
                </tbody>
            </table>
        </div>

        ${hardest ? `<div class="mb-4 p-3.5 rounded-2xl" style="background:var(--rm-warn-bg)">
            <p class="rm-label mb-1" style="color:var(--rm-warn)"><i class="fas fa-triangle-exclamation"></i> Câu khó nhất</p>
            <p class="text-sm font-semibold line-clamp-2">Câu ${hardest.i + 1}: ${escapeHtml(String(hardest.q.question || '').slice(0, 140))}</p>
            <p class="text-xs text-muted mt-1">Chỉ ${Math.round(100 * hardest.correctCount / hardest.total)}% chọn đúng — nên xem lại câu này.</p>
        </div>` : ''}

        <p class="rm-label mb-2">Tỉ lệ chọn trúng đáp án nhóm chốt${
            stats.length > 12 && !showAllStats ? ` <span class="text-muted font-normal">· 10 câu cả phòng sai nhiều nhất</span>` : ''}</p>
        <div class="space-y-1.5 mb-2">${(stats.length > 12 && !showAllStats
            ? graded.slice().sort((a, b) => (a.correctCount / a.total) - (b.correctCount / b.total)).slice(0, 10).sort((a, b) => a.i - b.i)
            : stats).map(s => {
            const pct = s.total ? Math.round(100 * s.correctCount / s.total) : 0;
            const tone = !s.total ? 'bg-gray-200' : pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
            return `<div class="flex items-center gap-2">
                <span class="w-9 shrink-0 text-[11px] font-bold text-muted tabular-nums">C${s.i + 1}</span>
                <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:var(--rm-line-soft)"><div class="${tone} h-full rounded-full" style="width:${pct}%"></div></div>
                <span class="w-16 shrink-0 text-right text-[11px] font-bold text-muted tabular-nums">${s.total ? pct + '%' : '—'} · ${s.total}</span>
            </div>`;
        }).join('')}</div>
        ${stats.length > 12 ? `<button id="result-allstats" class="rm-ghost-btn mb-6"><i class="fas fa-list"></i>${showAllStats ? 'Thu gọn' : `Xem tất cả ${stats.length} câu`}</button>` : '<div class="mb-4"></div>'}

        ${(() => {
            // Câu nên xem lại: có người bấm "cần bàn", có người đánh dấu, hoặc cả phòng đúng dưới 50%
            const need = stats.filter(st => {
                const flags = room.members.filter(m => m.flags?.['q' + st.i]).length;
                const doubts = room.members.filter(m => m.marks?.['q' + st.i]).length;
                const low = st.total > 0 && st.correctIdx !== null && (st.correctCount / st.total) < 0.5;
                return flags || doubts || low;
            });
            if (!need.length) return '';
            return `<p class="rm-label mb-2">Nên bàn lại sau buổi học</p>
            <div class="space-y-1.5 mb-6">${need.map(st => {
                const flags = room.members.filter(m => m.flags?.['q' + st.i]).length;
                return `<div class="p-2.5 rounded-xl flex items-start gap-2" style="background:var(--rm-surface);border:1px solid var(--rm-line)">
                    <span class="rm-chip warn shrink-0">C${st.i + 1}</span>
                    <span class="text-xs flex-1 min-w-0 line-clamp-2">${escapeHtml(String(st.q.question || '').slice(0, 120))}</span>
                    ${flags ? `<span class="rm-chip warn shrink-0">🗣 ${flags}</span>` : ''}
                    ${st.total ? `<span class="rm-chip shrink-0">${Math.round(100 * st.correctCount / st.total)}%</span>` : ''}
                </div>`;
            }).join('')}</div>`;
        })()}

        ${participationHtml()}

        <div class="flex flex-wrap gap-2 justify-center pb-4">
            <button id="result-notes-btn" class="rm-ghost-btn"><i class="fas fa-file-arrow-down"></i>Tải ghi chú của tôi</button>
            ${room.session.sourceQuizId ? `<a href="../quiz/quiz.html?id=${encodeURIComponent(room.session.sourceQuizId)}" target="_blank" rel="noopener"
                class="rm-ghost-btn"><i class="fas fa-rotate-left"></i>Ôn lại đề này một mình</a>` : ''}
            ${canControl() ? `
                <button id="result-minutes-btn" class="rm-ghost-btn"><i class="fas fa-file-arrow-down"></i>Tải biên bản</button>
                <button id="result-review-btn" class="rm-ghost-btn"><i class="fas fa-rotate-left"></i>Tạo đề ôn từ câu sai</button>
                <button id="result-save-btn" class="rm-cta rm-solid-btn"><i class="fas fa-floppy-disk"></i>Lưu bộ đề vào thư viện</button>
                <button id="result-again-btn" class="rm-ghost-btn"><i class="fas fa-rotate-right"></i>Làm lại từ câu 1</button>
                <button id="result-close-btn" class="rm-ghost-btn">Đóng phiên</button>
            ` : `<p class="text-xs text-muted">Chờ chủ trì mở phiên tiếp theo.</p>`}
        </div>`;
}
