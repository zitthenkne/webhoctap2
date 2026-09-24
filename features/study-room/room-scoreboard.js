// room-scoreboard.js — chấm điểm, bảng xếp hạng realtime và màn tổng kết phiên.
// Điểm được TÍNH LẠI từ dữ liệu (đáp án của từng người + mốc mở câu), không lưu riêng
// -> ai vào sau, ai F5, ai mất mạng rồi vào lại đều thấy đúng cùng một bảng.
import { room, correctIdxOf, optsOf, answerOf, canControl, isAnnounced, betOf, teamOn, teamOf, acceptedOf, isSplit, argsOf, flagOf, isEssay, acceptedText } from './room-state.js';
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
            // Nhóm có thể chấp nhận NHIỀU đáp án (chosen + alsoOk) -> trúng bất kỳ ý nào cũng đúng
            const ok = acceptedOf(i);
            if (!ok.length) return;
            const bet = betOf(m, i);                 // cược tự tin ×1 / ×2 / ×3
            if (ok.includes(a.i)) {
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
    const ok = acceptedOf(i);
    return { counts, total, correctIdx: c, accepted: ok, correctCount: ok.reduce((n, k) => n + (counts[k] || 0), 0) };
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
    if (!changed('rank', [room.session?.chosen, room.session?.alsoOk, room.session?.questions?.length,
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

// ---------- Danh hiệu vui cuối buổi (bản 32) ----------
// Tính lại từ dữ liệu sẵn có (điểm, lý do, nhận xét, ai đổi ý theo ai) — không lưu gì thêm.
const hasWhy = (v) => !!String(v || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img/i.test(String(v || ''));
function awardsHtml(rows) {
    const qs = room.session?.questions || [];
    const per = new Map(room.members.map(m => [m.uid, { member: m, why: 0, ask: 0, cmt: 0, conv: 0 }]));
    qs.forEach((q, i) => {
        const args = argsOf(i);
        args.forEach(a => { const p = per.get(a.uid); if (!p) return; p.cmt++; if (a.s === 'ask') p.ask++; });
        room.members.forEach(m => {
            const a = answerOf(m, i);
            if (!a) return;
            if (hasWhy(a.why)) per.get(m.uid).why++;
            const by = a.by?.id;
            if (!by) return;
            const author = String(by).startsWith('w:') ? String(by).slice(2) : args.find(x => x.id === by)?.uid;
            if (author && author !== m.uid && per.has(author)) per.get(author).conv++;
        });
    });
    const people = [...per.values()];
    const best = (list, val, min = 1, low = false) => list.reduce((b, x) => {
        const v = val(x);
        if (v === null || v === undefined || (!low && v < min)) return b;
        return !b || (low ? v < b.v : v > b.v) ? { x, v } : b;
    }, null);
    const graded = qs.filter((q, i) => isAnnounced(i) && !isEssay(q)).length;
    const out = [];
    const add = (ic, title, b, desc) => { if (b) out.push({ ic, title, member: b.x.member, desc: desc(b.v) }); };
    add('🔥', 'Chuỗi bất bại', best(rows, r => r.best, 3), v => `${v} câu đúng liên tiếp`);
    add('🎯', 'Xạ thủ', best(rows.filter(r => r.answered >= Math.max(2, Math.ceil(graded / 2))), r => r.correct / r.answered, .7), v => `${Math.round(v * 100)}% chính xác`);
    add('⚡', 'Tia chớp', best(rows.filter(r => r.avgMs !== null && r.avgMs < 30000 && r.correct >= 2), r => r.avgMs, 0, true), v => `đúng trung bình sau ${(v / 1000).toFixed(1)} giây`);
    add('🔄', 'Nhà thuyết phục', best(people, p => p.conv), v => `${v} lần có bạn đổi ý theo`);
    add('💭', 'Cây lý do', best(people, p => p.why, 2), v => `ghi lý do ở ${v} câu`);
    add('❓', 'Hỏi hay', best(people, p => p.ask), v => `${v} thắc mắc cho cả nhóm`);
    add('💬', 'Góp ý nhiệt', best(people, p => p.cmt, 3), v => `${v} nhận xét`);
    add('🎲', 'Liều ăn nhiều', best(rows, r => r.bigWin), v => `${v} lần cược thắng`);
    if (!out.length) return '';
    return `<div class="rm-awards">
        <p class="rm-label mb-2">🏅 Danh hiệu buổi này</p>
        <div class="rm-award-grid">${out.slice(0, 6).map((a, k) => `
            <div class="rm-award a${k % 4}" style="--d:${k * 90}ms">
                <span class="rm-award-ic" aria-hidden="true">${a.ic}</span>
                <div class="min-w-0">
                    <b>${a.title}</b>
                    <div class="rm-award-who">${avatarHtml(a.member, 'xs')}<span>${escapeHtml(shortName(a.member?.displayName || 'Khách', 14))}</span>${a.member?.uid === room.user?.uid ? '<em>bạn</em>' : ''}</div>
                    <small>${a.desc}</small>
                </div>
            </div>`).join('')}</div>
    </div>`;
}

// Dải "Hành trình" trong thẻ kết quả của mình: mỗi câu một hạt — đúng / sai / chọn mà chưa chốt / bỏ trống
function trailHtml(member) {
    const qs = room.session?.questions || [];
    if (!qs.length) return '';
    const L = (k) => String.fromCharCode(65 + k);
    return `<div class="rm-trail" aria-label="Hành trình từng câu của bạn">
        <span class="rm-trail-lb">Hành trình</span>
        <div class="rm-trail-dots">${qs.map((q, i) => {
            const a = answerOf(member, i);
            const picked = typeof a?.i === 'number';
            const ann = isAnnounced(i);
            const st = isEssay(q) ? 'essay' : ann && picked ? (acceptedOf(i).includes(a.i) ? 'ok' : 'bad') : picked ? 'done' : ann ? 'miss' : 'todo';
            const tip = `Câu ${i + 1}: ${isEssay(q) ? 'tự luận' : picked ? 'bạn chọn ' + L(a.i) : 'bỏ trống'}${ann ? ' · nhóm chốt ' + acceptedText(i) : ''}`;
            return `<i class="is-${st}${flagOf(member, i) ? ' flag' : ''}" title="${tip}"></i>`;
        }).join('')}</div>
    </div>`;
}

// Đếm điểm chạy từ 0 (chỉ lần đầu mở màn tổng kết của phiên này)
function countUp(root) {
    root.querySelectorAll('[data-count]').forEach(n => {
        const to = Number(n.dataset.count) || 0;
        if (!to) return;
        const t0 = performance.now();
        const step = (t) => {
            const p = Math.min(1, (t - t0) / 1100);
            n.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
            if (p < 1 && n.isConnected) requestAnimationFrame(step);
        };
        n.textContent = '0';
        requestAnimationFrame(step);
    });
}
let enteredFor = null;

/** Màn tổng kết cuối phiên (mọi người đều thấy). */
export function renderResults() {
    const el = document.getElementById('quiz-result');
    if (!el || !room.session) return;
    const questions = room.session.questions || [];
    const rows = computeScores().filter(r => r.answered > 0);
    const podium = rows.slice(0, 3);
    const stats = questions.map((q, i) => ({ i, q, ...questionStats(i) }));
    const graded = stats.filter(s => s.total > 0 && s.correctIdx !== null && s.correctIdx !== undefined);
    // Câu nên bàn lại: có người bấm "cần bàn", có người đánh dấu, cả phòng đúng dưới 50%, hoặc chưa thống nhất
    const flagsOf = (i) => room.members.filter(m => m.flags?.['q' + i]).length;
    const needOf = (st) => flagsOf(st.i) || room.members.some(m => m.marks?.['q' + st.i])
        || (st.total > 0 && st.correctIdx !== null && (st.correctCount / st.total) < 0.5) || isSplit(st.i);
    const rest = rows.slice(podium.length);          // bục đã có top 3 -> bảng chỉ còn người ngoài bục
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
                    <div class="rm-pod-bar"><b data-count="${r.points}">${r.points}</b><span>${r.correct} câu đúng</span></div>
                    <p class="rm-pod-name">${escapeHtml(shortName(r.name, 14))}</p>
                </div>`;
            }).join('')}</div>` : ''}

        ${awardsHtml(rows)}

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
                ${trailHtml(me.member)}
            </div>`;
        })()}

        ${rest.length ? `<div class="rm-panel overflow-hidden mb-5">
            <table class="rm-table">
                <thead>
                    <tr><th class="py-2 px-3 text-left">#</th><th class="text-left">Thành viên</th><th class="text-center">Đúng</th><th class="text-center">Chuỗi</th><th class="text-right px-3">Điểm</th></tr>
                </thead>
                <tbody>${rest.map(r => `
                    <tr>
                        <td class="font-bold text-muted">${r.rank}</td>
                        <td class="font-bold truncate">${escapeHtml(shortName(r.name, 22))}</td>
                        <td class="text-center tabular-nums">${r.correct}/${questions.length}</td>
                        <td class="text-center tabular-nums">${r.best}</td>
                        <td class="text-right font-black tabular-nums" style="color:var(--rm-accent)">${r.points}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>` : ''}

        ${(() => {
            // TỪNG CÂU: một danh sách duy nhất — thanh % chọn trúng cho mọi câu, câu nên bàn lại thì tô
            // vàng + kèm đề. (Trước đây có 3 khối nói lặp cùng một câu: "Câu khó nhất", dải tỉ lệ và
            // "Nên bàn lại sau buổi học".) Đề dài: gọn còn 10 câu sai nhiều nhất + mọi câu cần bàn.
            const worst = new Set(graded.slice().sort((a, b) => (a.correctCount / a.total) - (b.correctCount / b.total)).slice(0, 10).map(st => st.i));
            const brief = stats.length > 12 && !showAllStats;
            const list = brief ? stats.filter(st => worst.has(st.i) || needOf(st)) : stats;
            const needN = stats.filter(needOf).length;
            return `<p class="rm-label mb-2">Từng câu · tỉ lệ chọn trúng${needN ? ` <span class="rm-chip warn">${needN} câu nên bàn lại</span>` : ''}${
                brief ? ' <span class="text-muted font-normal">· câu sai nhiều nhất + câu cần bàn</span>' : ''}</p>
            <div class="rm-qstats mb-2">${list.map(st => {
                const pct = st.total ? Math.round(100 * st.correctCount / st.total) : 0;
                const tone = !st.total ? 'bg-gray-200' : pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
                const need = needOf(st);
                const flags = flagsOf(st.i);
                return `<div class="rm-qstat ${need ? 'is-need' : ''}">
                    <div class="rm-qstat-row">
                        <span class="rm-qstat-no">C${st.i + 1}</span>
                        <div class="rm-qstat-bar"><div class="${tone}" style="width:${pct}%"></div></div>
                        <span class="rm-qstat-pct">${st.total ? pct + '%' : '—'} · ${st.total}</span>
                    </div>
                    ${need ? `<div class="rm-qstat-why">
                        <span class="min-w-0 flex-1 line-clamp-2">${escapeHtml(String(st.q.question || '').replace(/<[^>]*>/g, ' ').slice(0, 120))}</span>
                        ${isSplit(st.i) ? '<span class="rm-chip lav shrink-0">🤝 chưa thống nhất</span>' : ''}
                        ${flags ? `<span class="rm-chip warn shrink-0">🗣 ${flags}</span>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('')}</div>
            ${stats.length > 12 ? `<button id="result-allstats" class="rm-ghost-btn mb-6"><i class="fas fa-list"></i>${showAllStats ? 'Thu gọn' : `Xem tất cả ${stats.length} câu`}</button>` : '<div class="mb-5"></div>'}`;
        })()}

        ${participationHtml()}

        <div class="flex flex-wrap gap-2 justify-center pb-4">
            <button id="result-minutes-btn" class="rm-cta rm-solid-btn"><i class="fas fa-file-pdf"></i>Biên bản buổi học (PDF / MD)</button>
            <button id="result-notes-btn" class="rm-ghost-btn"><i class="fas fa-file-arrow-down"></i>Tải ghi chú của tôi</button>
            ${room.session.sourceQuizId ? `<a href="../quiz/quiz.html?id=${encodeURIComponent(room.session.sourceQuizId)}" target="_blank" rel="noopener"
                class="rm-ghost-btn"><i class="fas fa-rotate-left"></i>Ôn lại đề này một mình</a>` : ''}
            ${canControl() ? `
                <button id="result-review-btn" class="rm-ghost-btn"><i class="fas fa-rotate-left"></i>Tạo đề ôn từ câu sai</button>
                <button id="result-save-btn" class="rm-cta rm-solid-btn"><i class="fas fa-floppy-disk"></i>Lưu bộ đề vào thư viện</button>
                <button id="result-again-btn" class="rm-ghost-btn"><i class="fas fa-rotate-right"></i>Làm lại từ câu 1</button>
                <button id="result-close-btn" class="rm-ghost-btn">Đóng phiên</button>
            ` : `<p class="text-xs text-muted">Chờ chủ trì mở phiên tiếp theo.</p>`}
        </div>`;

    // Lần đầu mở màn tổng kết của phiên này: bục mọc lên, huy hiệu dán vào, điểm đếm chạy.
    // Snapshot sau (nhịp tim, chat) vẽ lại thì đứng yên — không diễn lại.
    const key = `${room.roomId}:${room.session.startedAtMs || 0}`;
    if (enteredFor !== key) {
        enteredFor = key;
        el.classList.add('rm-res-enter');
        countUp(el);
        setTimeout(() => el.classList.remove('rm-res-enter'), 2600);
    }
}
