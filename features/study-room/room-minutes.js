// room-minutes.js — BIÊN BẢN BUỔI HỌC: gom đủ dữ liệu một phiên rồi xuất 2 dạng
//   · PDF  — trang in A4 dựng riêng (bìa, thẻ số liệu, bảng, thẻ từng câu, số trang) rồi gọi hộp
//            in của trình duyệt -> "Lưu dưới dạng PDF". Không dùng jsPDF: chữ tiếng Việt, ảnh và
//            công thức đều đẹp hơn khi để trình duyệt tự dàn trang, chữ trong PDF còn bôi đen được.
//   · Markdown (.md) — cùng bố cục, dán thẳng vào Obsidian / Notion / nhóm chat.
// Bố cục: I. Thông tin chung · II. Tóm tắt kết quả · III. Bảng xếp hạng · IV. Mức độ tham gia ·
//         V. Việc cần làm sau buổi học · VI. Chi tiết từng câu · VII. Phụ lục (thảo luận chung, tài liệu).
import { getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { stripOptionLabels } from '../quiz/quiz-helpers.js';
import {
    room, refs, optsOf, refIdxOf, chosenOf, noteOf, noteAuthorOf, optNoteOf, issueOf, whyOf, dissentOf,
    answerOf, questionAt, isCoop, editOf, prevVoteOf, explainerOf, thanksOf,
    acceptedOf, isSplit, isEssay, argsOf, agreeCount,
} from './room-state.js';
import { computeScores, questionStats } from './room-scoreboard.js';
import { renderRich, sanitizeHtml } from './room-editor.js';
import { chatMessages } from './room-chat.js';
import { escapeHtml } from './room-ui.js';
import { safeImgUrl } from './room-media.js';

const el = (id) => document.getElementById(id);
const L = (k) => String.fromCharCode(65 + k);
const nm = (m) => m?.displayName || 'Khách';
const pad = (n) => String(n).padStart(2, '0');
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dmy = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const safeLink = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(u || '') ? u : '';
const msTime = (m) => m.createdAt?.toMillis?.() || m.createdAt?.toDate?.()?.getTime?.() || 0;
const DIFF = { easy: '😌 dễ', ok: '😐 vừa', hard: '😵 khó' };

// ================= 1. GOM DỮ LIỆU =================
async function loadMessages() {
    try {
        const snap = await getDocs(query(refs.messages(), orderBy('createdAt', 'asc'), limit(2000)));
        const out = [];
        snap.forEach(d => out.push({ id: d.id, ...d.data() }));
        return out.sort((a, b) => msTime(a) - msTime(b));
    } catch (e) {
        return chatMessages().slice();          // mất mạng: dùng 120 tin đã có trên máy
    }
}

function collect(msgs, opt) {
    const s = room.session;
    const members = room.members.slice();
    const total = s.questions.length;
    const scores = computeScores();
    const talkers = msgs.filter(m => m.type !== 'notice');
    const start = s.startedAtMs || msTime(msgs[0] || {}) || Date.now();
    const end = s.ended ? (room.roomDoc?.live?.endedAt || msTime(msgs[msgs.length - 1] || {}) || Date.now()) : Date.now();

    const qs = s.questions.map((_, i) => {
        const q = questionAt(i);
        const opts = stripOptionLabels(optsOf(q));
        const chosen = chosenOf(i);
        const ref = refIdxOf(q);
        const st = questionStats(i);
        const by = (fn) => members.filter(fn);
        const diff = { easy: 0, ok: 0, hard: 0 };
        members.forEach(m => { const d = m.diff?.['q' + i]; if (diff[d] !== undefined) diff[d]++; });
        const accepted = acceptedOf(i);
        const essay = isEssay(q);
        const split = isSplit(i);
        const pctRight = accepted.length && st.total ? Math.round(100 * st.correctCount / st.total) : null;
        // Các phe + lập luận (bàn tròn) — ghi nhận mọi quan điểm, kể cả phe không được chấp nhận
        const args = argsOf(i).sort((a, b) => agreeCount(b.id) - agreeCount(a.id) || (a.at || 0) - (b.at || 0));
        const camps = opts.map((o, k) => ({
            k, o, ok: accepted.includes(k),
            who: members.filter(m => answerOf(m, i)?.i === k),
            pro: args.filter(a => a.o === k && a.s === 'pro'),
            con: args.filter(a => a.o === k && a.s === 'con'),
            other: args.filter(a => a.o === k && a.s !== 'pro' && a.s !== 'con'),
        })).filter(c => c.who.length || c.pro.length || c.con.length || c.other.length);
        const x = {
            i, q, opts, chosen, ref, st, pctRight, diff, accepted, essay, split, camps,
            looseArgs: args.filter(a => typeof a.o !== 'number'),
            changers: members.filter(m => { const a = answerOf(m, i); return typeof a?.from === 'number' && a.from !== a.i; }),
            votes: opts.map((_, k) => by(m => answerOf(m, i)?.i === k)),
            reasons: by(m => plain(whyOf(m, i))).map(m => ({ m, k: answerOf(m, i)?.i, why: whyOf(m, i), guess: !!answerOf(m, i)?.guess })),
            guess: by(m => answerOf(m, i)?.guess),
            dissent: by(m => dissentOf(m, i)),
            flagged: by(m => m.flags?.['q' + i]),
            unclear: by(m => m.unclear?.['q' + i]),
            explainer: explainerOf(i), thanks: thanksOf(i).length,
            issue: issueOf(i), edited: !!editOf(i), prev: prevVoteOf(i),
            note: noteOf(i) || (chosen !== null || s.shown?.['q' + i] ? (q.explanation || q.explain || '') : ''),
            noteBy: noteOf(i) ? noteAuthorOf(i)?.name || '' : (q.explanation || q.explain ? 'đáp án file' : ''),
            optNotes: opts.map((_, k) => optNoteOf(i, k) || (q.optionExplanations?.[k] || '')),
            chats: talkers.filter(m => m.type === 'chat' && m.qIdx === i),
            docs: talkers.filter(m => m.type === 'doc' && m.qIdx === i),
        };
        x.status = essay ? 'essay' : split ? 'split' : !accepted.length ? 'open' : ref === null ? 'nofile' : accepted.includes(ref) ? 'match' : 'diff';
        // Lý do nên ôn lại — viết thành câu để người đọc hiểu ngay vì sao câu này nằm trong danh sách
        const why = [];
        if (split) why.push('nhóm chưa thống nhất — cần tra cứu thêm nguồn');
        else if (!essay && !accepted.length) why.push('chưa chốt đáp án');
        if (essay && !plain(noteOf(i))) why.push('chưa có bài làm chung');
        if (x.status === 'diff') why.push(`nhóm chốt ${accepted.map(L).join(' + ')} khác đáp án file ${L(ref)}`);
        if (pctRight !== null && pctRight < 50) why.push(`chỉ ${pctRight}% chọn đúng`);
        if (x.issue && plain(x.issue)) why.push('có báo lỗi đề');
        if (x.flagged.length) why.push(`${x.flagged.length} người muốn bàn thêm`);
        if (x.unclear.length) why.push(`${x.unclear.length} người chưa hiểu`);
        if (x.dissent.length) why.push(`${x.dissent.length} người bảo lưu ý kiến`);
        if (diff.hard && diff.hard >= diff.easy + diff.ok) why.push('nhóm chấm là câu khó');
        x.review = why;
        return x;
    });

    const graded = qs.filter(x => x.pctRight !== null);
    const summary = {
        total,
        announced: qs.filter(x => x.accepted.length).length,
        essays: qs.filter(x => x.essay).length,
        splits: qs.filter(x => x.split),
        avg: graded.length ? Math.round(graded.reduce((a, x) => a + x.pctRight, 0) / graded.length) : null,
        match: qs.filter(x => x.status === 'match').length,
        diff: qs.filter(x => x.status === 'diff'),
        hardest: graded.filter(x => x.pctRight < 60).sort((a, b) => a.pctRight - b.pctRight)[0] || null,
        issues: qs.filter(x => plain(x.issue)),
        people: members.filter(m => Object.keys(m.answers || {}).length).length,
        minutes: Math.max(1, Math.round((end - start) / 60000)),
    };

    const participation = members.map(m => {
        const ans = Object.values(m.answers || {}).filter(Boolean);
        const giang = Object.values(s.explainer || {}).filter(e => e?.uid === m.uid).length;
        const camOn = Object.entries(s.thanks || {})
            .filter(([k]) => s.explainer?.[k]?.uid === m.uid)
            .reduce((n, [, v]) => n + Object.keys(v || {}).length, 0);
        return {
            m, done: ans.length, guess: ans.filter(a => a.guess).length, why: ans.filter(a => plain(a.why)).length,
            talk: talkers.filter(t => t.uid === m.uid).length, giang, camOn, flags: Object.values(m.flags || {}).filter(Boolean).length,
        };
    }).sort((a, b) => b.done - a.done || b.talk - a.talk);

    const cohostNames = (s.cohosts || []).map(u => nm(members.find(m => m.uid === u))).filter(Boolean);
    return {
        s, opt, qs, summary, scores: scores.filter(r => r.answered > 0), participation, members,
        info: {
            title: s.quizTitle || 'Phiên đánh đề',
            room: room.roomDoc?.title ? `${room.roomDoc.emoji || ''} ${room.roomDoc.title}`.trim() : room.roomId,
            code: room.roomId, date: dmy(start), from: hm(start), to: hm(end), minutes: summary.minutes,
            mode: isCoop() ? 'Cùng làm — ai cũng tự làm theo nhịp của mình' : 'Chủ trì cầm trịch — cả phòng bám theo câu của chủ trì',
            host: s.hostName || 'ẩn danh', cohosts: cohostNames,
            goal: room.roomDoc?.goal || '', ended: !!s.ended,
            exportedBy: room.user?.displayName || 'Khách', exportedAt: `${hm(Date.now())} ${dmy(Date.now())}`,
        },
        general: talkers.filter(m => typeof m.qIdx !== 'number' && m.type === 'chat'),
        allDocs: talkers.filter(m => m.type === 'doc'),
    };
}

// ================= 2. MARKDOWN =================
const looksHtml = (v) => /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span|img|a)\b/i.test(String(v || ''));
function htmlToMd(html) {
    const box = document.createElement('div');
    box.innerHTML = sanitizeHtml(html);
    const walk = (n) => {
        if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
        if (n.nodeType !== 1) return '';
        const inner = () => [...n.childNodes].map(walk).join('');
        switch (n.tagName) {
            case 'B': case 'STRONG': { const t = inner().trim(); return t ? `**${t}**` : ''; }
            case 'I': case 'EM': { const t = inner().trim(); return t ? `*${t}*` : ''; }
            case 'MARK': return `==${inner().trim()}==`;
            case 'CODE': return '`' + inner() + '`';
            case 'BR': return '\n';
            case 'P': case 'DIV': return '\n' + inner().trim() + '\n';
            case 'LI': return '\n- ' + inner().trim();
            case 'UL': case 'OL': return '\n' + inner() + '\n';
            case 'IMG': { const u = n.getAttribute('src') || ''; return u.startsWith('data:') ? '*(ảnh nhúng — xem bản PDF)*' : `![ảnh](${u})`; }
            case 'A': return `[${inner().trim() || 'link'}](${n.getAttribute('href')})`;
            default: return inner();
        }
    };
    return walk(box).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const md = (v) => { const t = String(v ?? '').trim(); return !t ? '' : looksHtml(t) ? htmlToMd(t) : t; };
const cell = (v) => md(v).replace(/\|/g, '\\|').replace(/\n+/g, '<br>') || ' ';
const quoteMd = (v) => md(v).split('\n').map(l => '> ' + l).join('\n');
const imgsMd = (list, on) => on ? (list || []).map(im => safeImgUrl(im.u)).filter(u => u && !u.startsWith('data:')).map(u => `![ảnh](${u})`).join(' ') : '';

function buildMarkdown(d) {
    const { info, summary: S, opt } = d;
    const out = [];
    const push = (...l) => out.push(...l);
    push(`# 📋 Biên bản buổi đánh đề — ${info.title}`, '',
        `> **${info.room}** · ${info.date} · ${info.from}–${info.to} (${info.minutes} phút) · xuất bởi ${info.exportedBy} lúc ${info.exportedAt}`, '');

    push('## I. Thông tin chung', '', '| Mục | Chi tiết |', '|---|---|',
        `| Bộ đề | ${cell(info.title)} — ${S.total} câu |`,
        `| Phòng | ${cell(info.room)} (mã \`${info.code}\`) |`,
        `| Thời gian | ${info.date}, ${info.from} – ${info.to} (${info.minutes} phút)${info.ended ? '' : ' · *phiên chưa kết thúc*'} |`,
        `| Kiểu buổi học | ${info.mode} |`,
        `| Chủ trì | ${cell(info.host)}${info.cohosts.length ? ` · đồng chủ trì: ${cell(info.cohosts.join(', '))}` : ''} |`,
        `| Thành viên (${d.members.length}) | ${cell(d.members.map(nm).join(', '))} |`,
        ...(plain(info.goal) ? [`| Mục tiêu | ${cell(info.goal)} |`] : []), '');

    push('## II. Tóm tắt kết quả', '',
        `- **Đã chốt đáp án:** ${S.announced}/${S.total - S.essays} câu trắc nghiệm${S.essays ? ` · ${S.essays} câu tự luận` : ''}`,
        ...(S.splits.length ? [`- **Chưa thống nhất (ghi nhận nhiều quan điểm):** câu ${S.splits.map(x => x.i + 1).join(', ')}`] : []),
        `- **Cả phòng chọn đúng trung bình:** ${S.avg === null ? 'chưa có câu nào chốt' : S.avg + '%'}`,
        `- **Khớp đáp án file:** ${S.match}/${S.announced} câu đã chốt${S.diff.length ? ` · **lệch file:** câu ${S.diff.map(x => x.i + 1).join(', ')} → nên kiểm lại nguồn` : ''}`,
        ...(S.hardest ? [`- **Câu khó nhất:** câu ${S.hardest.i + 1} — chỉ ${S.hardest.pctRight}% chọn đúng`] : []),
        ...(S.issues.length ? [`- **Báo lỗi đề:** câu ${S.issues.map(x => x.i + 1).join(', ')}`] : []),
        `- **Người tham gia làm bài:** ${S.people}/${d.members.length}`, '');

    push('## III. Bảng xếp hạng', '');
    if (d.scores.length) {
        push('| Hạng | Thành viên | Đã làm | Đúng | Chính xác | Chuỗi | Điểm |', '|:-:|---|:-:|:-:|:-:|:-:|--:|');
        d.scores.forEach(r => push(`| ${r.rank} | ${cell(r.name)} | ${r.answered} | ${r.correct} | ${r.answered ? Math.round(100 * r.correct / r.answered) : 0}% | ${r.best} | **${r.points}** |`));
        push('', '*Điểm chỉ tính các câu đã chốt: đúng +100, nhanh thưởng tới +60, chuỗi đúng +10/bậc, nhân hệ số cược.*', '');
    } else push('*Chưa có câu nào được chốt nên chưa xếp hạng.*', '');

    push('## IV. Mức độ tham gia', '', '| Thành viên | Đã làm | Đoán | Ghi lý do | Ý kiến thảo luận | Nhận giảng | Được cảm ơn | Muốn bàn |', '|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|');
    d.participation.forEach(p => push(`| ${cell(nm(p.m))} | ${p.done}/${S.total} | ${p.guess} | ${p.why} | ${p.talk} | ${p.giang} | ${p.camOn} | ${p.flags} |`));
    push('');

    const todo = d.qs.filter(x => x.review.length);
    push('## V. Việc cần làm sau buổi học', '');
    if (todo.length) todo.forEach(x => push(`- [ ] **Câu ${x.i + 1}** — ${x.review.join(' · ')}`));
    else push('- Không có câu nào cần ôn lại. Tuyệt vời! 🎉');
    push('');

    push('## VI. Chi tiết từng câu', '');
    d.qs.filter(x => !opt.only || x.review.length).forEach(x => {
        const q = x.q;
        const badge = x.essay ? '✍️ tự luận' : x.split ? '🤝 chưa thống nhất' : !x.accepted.length ? '⏳ chưa chốt'
            : `✅ chốt ${x.accepted.map(L).join(' + ')}${x.ref !== null ? ` · 📄 file ${L(x.ref)} ${x.status === 'match' ? '(khớp)' : '(**lệch**)'}` : ' · 📄 file không có đáp án'}`;
        push(`### Câu ${x.i + 1} · ${badge}`);
        const meta = [q.topic && String(q.topic).toLowerCase() !== 'chung' ? `Chủ đề: ${plain(q.topic)}` : '', q.level ? `Mức độ: ${plain(q.level)}` : '', q.source ? `Nguồn: ${plain(q.source)}` : '', x.edited ? 'nhóm đã sửa đề' : ''].filter(Boolean);
        if (meta.length) push(`*${meta.join(' · ')}*`);
        push('');
        const caseText = q.caseText || q.case;
        if (caseText) push(`> **${plain(q.caseTitle) || 'Ca lâm sàng'}:** ${md(caseText).replace(/\n/g, '\n> ')}`, '');
        push(`**Đề bài:** ${md(q.question)}`, '');
        if (!x.essay) {
            push(`| | Phương án | Chọn | Tỉ lệ |${opt.reasons ? ' Ai chọn |' : ''}`, `|:-:|---|:-:|:-:|${opt.reasons ? '---|' : ''}`);
            x.opts.forEach((o, k) => {
                const n = x.st.counts[k] || 0;
                const pct = x.st.total ? Math.round(100 * n / x.st.total) : 0;
                const mark = `${x.accepted.includes(k) ? ' ✅' : ''}${x.ref === k ? ' 📄' : ''}`;
                const txt = x.accepted.includes(k) ? `**${cell(o)}**` : cell(o);
                push(`| **${L(k)}**${mark} | ${txt} | ${n} | ${pct}% |${opt.reasons ? ` ${cell(x.votes[k].map(nm).join(', '))} |` : ''}`);
            });
            push('', '*✅ nhóm chấp nhận · 📄 đáp án trong file*', '');
        }
        if (x.accepted.length) push(`**Kết luận:** nhóm ${x.accepted.length > 1 ? 'chấp nhận' : 'chốt'} **${x.accepted.map(L).join(' và ')}**${x.pctRight !== null ? ` — ${x.pctRight}% cả phòng chọn đúng` : ''}${x.dissent.length ? ` · ✋ bảo lưu: ${x.dissent.map(nm).join(', ')}` : ''}.`, '');
        if (x.split) push(`**Kết luận:** 🤝 nhóm **chưa thống nhất** — ghi nhận ${x.camps.filter(c => c.who.length).length} quan điểm, câu này không tính điểm, cần tra cứu thêm.`, '');

        if (plain(x.note) || /<img/i.test(x.note)) push(`**${x.essay ? '✍️ Bài làm chung' : '💡 Giải thích chung'}**${x.noteBy ? ` *(${x.noteBy})*` : ''}`, '', quoteMd(x.note), '');
        const on = x.optNotes.map((t, k) => (plain(t) ? `- **${L(k)}:** ${md(t).replace(/\n/g, ' ')}` : '')).filter(Boolean);
        if (on.length) push('**Giải thích từng phương án**', ...on, '');
        if (q.expanded) push(`**📖 Mở rộng:** ${md(q.expanded)}`, '');
        if (q.note) push(`**📌 Ghi nhớ:** ${md(q.note)}`, '');
        if (opt.reasons && (x.camps.length || x.looseArgs.length)) {
            // Mọi quan điểm, có tên — kể cả phe không được chấp nhận
            push(x.essay ? '**🗣 Nhận xét bài làm chung**' : '**🗣 Các quan điểm & nhận xét**');
            const argMd = (a) => `${{ pro: '✚', con: '✖', ask: '❓', src: '📚', cmt: '💬' }[a.s] || '•'} **${nm(a.member)}**: ${a.qt ? `*“${String(a.qt).replace(/\n/g, ' ')}”* — ` : ''}${String(a.t).replace(/\n/g, ' ')}${agreeCount(a.id) ? ` (👍 ${agreeCount(a.id)})` : ''}`;
            x.camps.forEach(c => {
                push(`- **Phe ${L(c.k)}**${c.ok ? ' ✅' : ''} — ${c.who.length} người${c.who.length ? ': ' + c.who.map(m => {
                    const a = answerOf(m, x.i);
                    const tag = [typeof a.from === 'number' && a.from !== a.i ? `đổi từ ${L(a.from)}` : '', a.guess ? 'đoán' : '', m.dissent?.['q' + x.i] ? 'bảo lưu' : ''].filter(Boolean).join(', ');
                    const w = md(whyOf(m, x.i)).replace(/\n/g, ' ');
                    return `${nm(m)}${tag ? ` *(${tag})*` : ''}${w ? ` — "${w}"` : ''}`;
                }).join('; ') : ''}`);
                [...c.pro, ...c.con, ...c.other].forEach(a => push(`  - ${argMd(a)}`));
            });
            x.looseArgs.forEach(a => push(`- ${argMd(a)}`));
            if (x.changers.length) push(`- 🔄 Đổi ý sau khi bàn: ${x.changers.map(m => { const a = answerOf(m, x.i); return `${nm(m)} (${L(a.from)} → ${L(a.i)})`; }).join(', ')}`);
            push('');
        }
        if (opt.chat && x.docs.length) {
            push('**📚 Tài liệu trích dẫn**');
            x.docs.forEach(m => {
                push(`- **${plain(m.title) || 'Tài liệu'}**${m.src ? ` — ${plain(m.src)}` : ''} *(${nm(m)} chia sẻ)*${safeLink(m.link) ? ` · [mở link](${m.link})` : ''}`);
                if (m.text) push(`  > ${String(m.text).replace(/\n/g, '\n  > ')}`);
                const im = imgsMd(m.images, opt.images);
                if (im) push(`  ${im}`);
            });
            push('');
        }
        if (opt.chat && x.chats.length) {
            push(`**💬 Thảo luận** (${x.chats.length} ý kiến)`);
            x.chats.forEach(m => {
                const im = imgsMd(m.images, opt.images);
                push(`- **${nm(m)}**${typeof m.ans === 'number' ? ` *(chọn ${L(m.ans)})*` : ''} · ${hm(msTime(m) || Date.now())}${m.reply ? ` · ↩ trả lời ${m.reply.name || ''}` : ''}: ${String(m.text || '').replace(/\n/g, '\n  ')}${im ? '\n  ' + im : ''}`);
            });
            push('');
        }
        const notes = [
            x.flagged.length ? `🗣 cần bàn: ${x.flagged.map(nm).join(', ')}` : '',
            x.unclear.length ? `🤔 chưa hiểu: ${x.unclear.map(nm).join(', ')}` : '',
            x.guess.length ? `🎲 chọn kiểu đoán: ${x.guess.map(nm).join(', ')}` : '',
            (x.diff.easy + x.diff.ok + x.diff.hard) ? `độ khó: ${Object.entries(x.diff).filter(([, n]) => n).map(([k, n]) => `${DIFF[k]} ${n}`).join(' · ')}` : '',
            x.explainer?.name ? `🎙 người giảng: ${x.explainer.name}${x.thanks ? ` (💖 ${x.thanks} lời cảm ơn)` : ''}` : '',
            plain(x.issue) ? `⚠ báo lỗi đề: ${plain(x.issue)}` : '',
            x.prev ? `🔁 đã bầu lại — vòng trước: ${x.prev.map((n, k) => `${L(k)} ${n}`).join(' · ')}` : '',
        ].filter(Boolean);
        if (notes.length) push(`**Ghi nhận khác:** ${notes.join(' · ')}`, '');
        push('---', '');
    });

    if (opt.chat && (d.general.length || d.allDocs.length)) {
        push('## VII. Phụ lục', '');
        if (d.general.length) {
            push('### Thảo luận chung (không gắn câu nào)');
            d.general.forEach(m => push(`- **${nm(m)}** · ${hm(msTime(m) || Date.now())}: ${String(m.text || '').replace(/\n/g, ' ')} ${imgsMd(m.images, opt.images)}`.trimEnd()));
            push('');
        }
        if (d.allDocs.length) {
            push('### Tài liệu tham khảo của buổi học');
            d.allDocs.forEach((m, k) => push(`${k + 1}. **${plain(m.title) || 'Tài liệu'}**${m.src ? ` — ${plain(m.src)}` : ''}${typeof m.qIdx === 'number' ? ` (câu ${m.qIdx + 1})` : ''}${safeLink(m.link) ? ` — ${m.link}` : ''}`));
            push('');
        }
    }
    push(`*Biên bản tạo tự động bởi Zitthenkne · phòng ${info.code} · ${info.exportedAt}*`);
    return out.join('\n');
}

// ================= 3. HTML IN ĐẸP (→ PDF) =================
const E = escapeHtml;
const rich = (v, on = true) => {
    let h = renderRich(v);
    if (!on) h = h.replace(/<img[^>]*>/gi, '<em class="noimg">[ảnh]</em>');
    return h;
};
const chipHtml = (t, cls = '') => `<span class="tag ${cls}">${t}</span>`;
const imgsHtml = (list, on) => {
    if (!on) return '';
    const u = (list || []).map(im => safeImgUrl(im.u)).filter(Boolean);
    return u.length ? `<div class="imgs">${u.map(x => `<img src="${E(x)}" alt="">`).join('')}</div>` : '';
};
const who = (list) => list.map(m => E(nm(m))).join(', ');
const talk = (t) => E(t)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/(^|\n)&gt; ?([^\n]*)/g, '$1<span class="ql">$2</span>')
    .replace(/\n/g, '<br>');

function buildHtml(d) {
    const { info, summary: S, opt } = d;
    const logo = new URL('../../assets/opt/logo-96.webp', document.baseURI).href;
    const math = /\$|\\\(|\\\[/.test(JSON.stringify(d.s.questions) + JSON.stringify(d.s.notes || {}) + JSON.stringify(d.s.optNotes || {}));
    const kpi = (v, t, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><span>${t}</span></div>`;
    const todo = d.qs.filter(x => x.review.length);
    const shown = d.qs.filter(x => !opt.only || x.review.length);
    const sec = (no, title, body) => `<section class="sec"><h2><span class="no">${no}</span>${title}</h2>${body}</section>`;

    const qCard = (x) => {
        const q = x.q;
        const tags = [
            x.essay ? chipHtml('✍️ Tự luận', 'lav') : x.split ? chipHtml('🤝 Chưa thống nhất', 'warn') : !x.accepted.length ? chipHtml('⏳ chưa chốt', 'muted') : chipHtml(`✅ Nhóm chốt ${x.accepted.map(L).join(' + ')}`, 'ok'),
            x.essay ? '' : x.ref !== null ? chipHtml(`📄 File ${L(x.ref)}${x.accepted.length ? (x.status === 'match' ? ' · khớp' : ' · LỆCH') : ''}`, x.status === 'diff' ? 'warn' : '') : chipHtml('📄 file không có đáp án', 'muted'),
            x.pctRight !== null ? chipHtml(`${x.pctRight}% chọn đúng`, x.pctRight < 50 ? 'bad' : 'lav') : '',
            q.topic && String(q.topic).toLowerCase() !== 'chung' ? chipHtml(E(plain(q.topic))) : '',
            q.level ? chipHtml(E(plain(q.level))) : '',
            x.edited ? chipHtml('✏ nhóm đã sửa đề', 'warn') : '',
        ].join('');
        const caseText = q.caseText || q.case;
        const rows = x.opts.map((o, k) => {
            const n = x.st.counts[k] || 0;
            const pct = x.st.total ? Math.round(100 * n / x.st.total) : 0;
            const cls = [x.accepted.includes(k) ? 'is-chosen' : '', x.ref === k && !x.accepted.includes(k) ? 'is-ref' : ''].join(' ');
            const exp = plain(x.optNotes[k]) || /<img/i.test(x.optNotes[k]) ? `<div class="oexp">${rich(x.optNotes[k], opt.images)}</div>` : '';
            return `<tr class="${cls}">
                <td class="lt"><span class="let">${L(k)}</span></td>
                <td class="rich">${rich(o, opt.images)}${x.ref === k ? ' <span class="mini">📄 đáp án file</span>' : ''}${exp}</td>
                <td class="vt"><span class="bar"><i style="width:${pct}%"></i></span><b>${n}</b> · ${pct}%</td>
                ${opt.reasons ? `<td class="who">${who(x.votes[k]) || '<span class="muted">—</span>'}</td>` : ''}
            </tr>`;
        }).join('');
        const verdict = x.essay ? ''
            : x.accepted.length
            ? `<div class="verdict ${x.status === 'diff' ? 'diff' : ''}">Kết luận: nhóm ${x.accepted.length > 1 ? 'chấp nhận' : 'chốt'} <b>${x.accepted.map(L).join(' và ')}</b>${x.pctRight !== null ? ` — ${x.pctRight}% cả phòng chọn đúng` : ''}${x.status === 'diff' ? ` · khác đáp án file <b>${L(x.ref)}</b>, nên kiểm lại nguồn` : ''}${x.dissent.length ? `<br><span class="soft">✋ Bảo lưu ý kiến: ${who(x.dissent)}</span>` : ''}</div>`
            : x.split
            ? `<div class="verdict diff">🤝 Nhóm chưa thống nhất — ghi nhận ${x.camps.filter(c => c.who.length).length} quan điểm (xem bên dưới). Câu này không tính điểm, cần tra cứu thêm.</div>`
            : '<div class="verdict open">Câu này chưa được chốt đáp án trong buổi học.</div>';
        const blocks = [];

        if (plain(x.note) || /<img/i.test(x.note)) blocks.push(`<div class="block expl"><h4>${x.essay ? '✍️ Bài làm chung' : '💡 Giải thích chung'}${x.noteBy ? ` <em>· ${E(x.noteBy)}</em>` : ''}</h4><div class="rich">${rich(x.note, opt.images)}</div></div>`);
        if (q.expanded) blocks.push(`<div class="block call lav"><h4>📖 Mở rộng</h4><div class="rich">${rich(q.expanded, opt.images)}</div></div>`);
        if (q.note) blocks.push(`<div class="block call pink"><h4>📌 Ghi nhớ</h4><div class="rich">${rich(q.note, opt.images)}</div></div>`);
        if (opt.reasons && (x.camps.length || x.looseArgs.length)) {
            const IC = { pro: '✚', con: '✖', ask: '❓', src: '📚', cmt: '💬' };
            const argLi = (a) => `<li class="arg ${a.s}"><span class="aic">${IC[a.s] || '•'}</span> <b>${E(nm(a.member))}</b>: ${a.qt ? `<i class="soft">“${E(a.qt)}”</i> — ` : ''}${E(a.t)}${agreeCount(a.id) ? ` <span class="soft">· 👍 ${agreeCount(a.id)}</span>` : ''}</li>`;
            blocks.push(`<div class="block"><h4>${x.essay ? '🗣 Nhận xét bài làm chung' : '🗣 Các quan điểm & nhận xét'}</h4>${x.camps.map(c => `<div class="camp ${c.ok ? 'ok' : ''}">
                <p class="camp-h"><span class="let sm">${L(c.k)}</span> <b>Phe ${L(c.k)}</b> · ${c.who.length} người${c.ok ? ' <span class="tag ok">được chấp nhận</span>' : ''}</p>
                ${c.who.length ? `<ul class="reasons">${c.who.map(m => {
                    const a = answerOf(m, x.i);
                    const tag = [typeof a.from === 'number' && a.from !== a.i ? `đổi từ ${L(a.from)}` : '', a.guess ? 'đoán' : '', m.dissent?.['q' + x.i] ? 'bảo lưu' : ''].filter(Boolean);
                    return `<li><b>${E(nm(m))}</b>${tag.map(t => ` <span class="mini">${t}</span>`).join('')} ${plain(whyOf(m, x.i)) ? `<span class="rich inl">${rich(whyOf(m, x.i), opt.images)}</span>` : '<span class="soft">— chưa ghi lý do</span>'}</li>`;
                }).join('')}</ul>` : ''}
                ${[...c.pro, ...c.con, ...c.other].length ? `<ul class="args">${[...c.pro, ...c.con, ...c.other].map(argLi).join('')}</ul>` : ''}
            </div>`).join('')}
            ${x.looseArgs.length ? `<ul class="args">${x.looseArgs.map(argLi).join('')}</ul>` : ''}
            ${x.changers.length ? `<p class="soft">🔄 Đổi ý sau khi bàn: ${x.changers.map(m => { const a = answerOf(m, x.i); return `${E(nm(m))} (${L(a.from)} → ${L(a.i)})`; }).join(', ')}</p>` : ''}</div>`);
        }
        if (opt.chat && x.docs.length) blocks.push(`<div class="block"><h4>📚 Tài liệu trích dẫn</h4>${x.docs.map(m => `<div class="docref">
            <p><b>${E(plain(m.title) || 'Tài liệu')}</b>${m.src ? ` — ${E(plain(m.src))}` : ''} <span class="soft">· ${E(nm(m))} chia sẻ</span></p>
            ${m.text ? `<blockquote>${E(m.text).replace(/\n/g, '<br>')}</blockquote>` : ''}
            ${imgsHtml(m.images, opt.images)}
            ${safeLink(m.link) ? `<p class="link">🔗 <a href="${E(m.link)}">${E(m.link)}</a></p>` : ''}</div>`).join('')}</div>`);
        if (opt.chat && x.chats.length) blocks.push(`<div class="block"><h4>💬 Thảo luận · ${x.chats.length} ý kiến</h4><div class="chat">${x.chats.map(m => `<div class="m">
            <p><b>${E(nm(m))}</b>${typeof m.ans === 'number' ? ` <span class="let sm">${L(m.ans)}</span>` : ''} <span class="soft">${hm(msTime(m) || Date.now())}</span>${m.reply ? ` <span class="soft">↩ trả lời ${E(m.reply.name || '')}</span>` : ''}</p>
            ${m.text ? `<p>${talk(m.text)}</p>` : ''}${imgsHtml(m.images, opt.images)}</div>`).join('')}</div></div>`);
        const notes = [
            x.flagged.length ? `🗣 Cần bàn thêm: ${who(x.flagged)}` : '',
            x.unclear.length ? `🤔 Chưa hiểu: ${who(x.unclear)}` : '',
            x.guess.length ? `🎲 Chọn kiểu đoán: ${who(x.guess)}` : '',
            (x.diff.easy + x.diff.ok + x.diff.hard) ? `Độ khó nhóm chấm: ${Object.entries(x.diff).filter(([, n]) => n).map(([k, n]) => `${DIFF[k]} ${n}`).join(' · ')}` : '',
            x.explainer?.name ? `🎙 Người giảng: ${E(x.explainer.name)}${x.thanks ? ` · 💖 ${x.thanks} lời cảm ơn` : ''}` : '',
            plain(x.issue) ? `<span class="bad">⚠ Báo lỗi đề: ${E(plain(x.issue))}</span>` : '',
            x.prev ? `🔁 Đã bầu lại — vòng trước: ${x.prev.map((n, k) => `${L(k)} ${n}`).join(' · ')}` : '',
        ].filter(Boolean);
        return `<article class="q" id="cau-${x.i + 1}">
            <div class="q-head"><span class="q-no">Câu ${x.i + 1}</span>${tags}</div>
            ${q.source ? `<p class="src">Nguồn: ${E(plain(q.source))}</p>` : ''}
            ${caseText ? `<div class="case"><b>${E(plain(q.caseTitle) || 'Ca lâm sàng')}</b><div class="rich">${rich(caseText, opt.images)}</div></div>` : ''}
            <div class="stem rich">${rich(q.question, opt.images)}</div>
            ${x.essay ? '' : `<table class="opts"><thead><tr><th></th><th>Phương án</th><th>Số người chọn</th>${opt.reasons ? '<th>Ai chọn</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`}
            ${verdict}
            ${blocks.join('')}
            ${notes.length ? `<p class="notes">${notes.join('<span class="dot">·</span>')}</p>` : ''}
        </article>`;
    };

    const body = `
    <header class="cover">
        <div class="cover-top"><img src="${E(logo)}" alt=""><span>Zitthenkne · Phòng đánh đề chung</span><em>${E(info.date)}</em></div>
        <p class="kicker">Biên bản buổi đánh đề</p>
        <h1>${E(info.title)}</h1>
        <p class="sub">${E(info.room)} · ${info.from} – ${info.to} · ${info.minutes} phút · ${d.members.length} thành viên · ${S.total} câu</p>
    </header>

    <div class="kpis">
        ${kpi(`${S.announced}<small>/${S.total - S.essays}</small>`, S.essays ? `câu trắc nghiệm đã chốt · ${S.essays} tự luận` : 'câu đã chốt đáp án')}
        ${kpi(S.avg === null ? '—' : S.avg + '%', 'cả phòng chọn đúng (trung bình)', S.avg !== null && S.avg < 50 ? 'bad' : 'ok')}
        ${kpi(`${S.match}<small>/${S.announced || 0}</small>`, 'câu khớp đáp án file', S.diff.length ? 'warn' : '')}
        ${kpi(todo.length, 'câu cần ôn lại', todo.length ? 'warn' : 'ok')}
        ${kpi(`${S.people}<small>/${d.members.length}</small>`, 'người tham gia làm bài')}
        ${kpi(info.minutes + '′', 'thời lượng buổi học')}
    </div>

    ${sec('I', 'Thông tin chung', `<table class="info"><tbody>
        <tr><td>Bộ đề</td><td><b>${E(info.title)}</b> — ${S.total} câu</td></tr>
        <tr><td>Phòng</td><td>${E(info.room)} <span class="soft">(mã ${E(info.code)})</span></td></tr>
        <tr><td>Thời gian</td><td>${info.date}, ${info.from} – ${info.to} (${info.minutes} phút)${info.ended ? '' : ' <span class="mini">phiên chưa kết thúc</span>'}</td></tr>
        <tr><td>Kiểu buổi học</td><td>${E(info.mode)}</td></tr>
        <tr><td>Chủ trì</td><td>${E(info.host)}${info.cohosts.length ? ` <span class="soft">· đồng chủ trì: ${E(info.cohosts.join(', '))}</span>` : ''}</td></tr>
        <tr><td>Thành viên (${d.members.length})</td><td>${who(d.members)}</td></tr>
        ${plain(info.goal) ? `<tr><td>Mục tiêu buổi học</td><td class="rich">${rich(info.goal, opt.images)}</td></tr>` : ''}
    </tbody></table>`)}

    ${sec('II', 'Tóm tắt kết quả', `<ul class="facts">
        <li>Đã chốt đáp án <b>${S.announced}/${S.total - S.essays}</b> câu trắc nghiệm${S.essays ? ` (và ${S.essays} câu tự luận)` : ''}; cả phòng chọn đúng trung bình <b>${S.avg === null ? '—' : S.avg + '%'}</b>.</li>
        ${S.splits.length ? `<li>Nhóm <b>chưa thống nhất</b> ở câu ${S.splits.map(x => `<a href="#cau-${x.i + 1}">${x.i + 1}</a>`).join(', ')} — mọi quan điểm được ghi lại để tra cứu thêm.</li>` : ''}
        <li>Khớp đáp án file <b>${S.match}</b> câu${S.diff.length ? `; <b class="warn">lệch file ở câu ${S.diff.map(x => `<a href="#cau-${x.i + 1}">${x.i + 1}</a>`).join(', ')}</b> — nên kiểm lại nguồn trước khi học thuộc` : '; không có câu nào lệch file'}.</li>
        ${S.hardest ? `<li>Câu khó nhất: <a href="#cau-${S.hardest.i + 1}"><b>câu ${S.hardest.i + 1}</b></a> — chỉ ${S.hardest.pctRight}% chọn đúng.</li>` : ''}
        ${S.issues.length ? `<li>Có báo lỗi đề ở câu ${S.issues.map(x => x.i + 1).join(', ')}.</li>` : ''}
    </ul>
    <p class="cap">Bản đồ câu — xanh: nhóm chốt khớp file · vàng: lệch file · đỏ: dưới 50% chọn đúng · xám: chưa chốt</p>
    <div class="qmap">${d.qs.map(x => `<a href="#cau-${x.i + 1}" class="qc ${x.essay ? 'essay' : x.split ? 'diff' : !x.accepted.length ? 'open' : x.status === 'diff' ? 'diff' : x.pctRight !== null && x.pctRight < 50 ? 'low' : 'ok'}">${x.i + 1}</a>`).join('')}</div>`)}

    ${sec('III', 'Bảng xếp hạng', d.scores.length ? `<table class="grid"><thead><tr><th class="c">Hạng</th><th>Thành viên</th><th class="c">Đã làm</th><th class="c">Đúng</th><th class="c">Chính xác</th><th class="c">Chuỗi</th><th class="r">Điểm</th></tr></thead><tbody>
        ${d.scores.map(r => `<tr class="${r.rank <= 3 ? 'top' : ''}"><td class="c">${['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}</td><td><b>${E(r.name)}</b></td><td class="c">${r.answered}</td><td class="c">${r.correct}</td><td class="c">${r.answered ? Math.round(100 * r.correct / r.answered) : 0}%</td><td class="c">${r.best}</td><td class="r"><b>${r.points}</b></td></tr>`).join('')}
        </tbody></table><p class="cap">Điểm chỉ tính các câu đã chốt: đúng +100, trả lời nhanh thưởng tới +60, mỗi câu đúng liên tiếp +10 (tối đa 5 bậc), nhân hệ số cược tự tin.</p>`
        : '<p class="soft">Chưa có câu nào được chốt nên chưa xếp hạng.</p>')}

    ${sec('IV', 'Mức độ tham gia', `<table class="grid"><thead><tr><th>Thành viên</th><th class="c">Đã làm</th><th class="c">Đoán</th><th class="c">Ghi lý do</th><th class="c">Ý kiến</th><th class="c">Nhận giảng</th><th class="c">Được cảm ơn</th><th class="c">Muốn bàn</th></tr></thead><tbody>
        ${d.participation.map(p => `<tr><td><b>${E(nm(p.m))}</b></td><td class="c">${p.done}/${S.total}</td><td class="c">${p.guess || '—'}</td><td class="c">${p.why || '—'}</td><td class="c">${p.talk || '—'}</td><td class="c">${p.giang || '—'}</td><td class="c">${p.camOn || '—'}</td><td class="c">${p.flags || '—'}</td></tr>`).join('')}
    </tbody></table>`)}

    ${sec('V', 'Việc cần làm sau buổi học', todo.length ? `<ul class="todo">${todo.map(x => `<li><span class="box"></span><a href="#cau-${x.i + 1}"><b>Câu ${x.i + 1}</b></a> <span class="stemmini">${E(plain(x.q.question).slice(0, 110))}${plain(x.q.question).length > 110 ? '…' : ''}</span><br><span class="why">${x.review.join(' · ')}</span></li>`).join('')}</ul>`
        : '<p class="ok-line">🎉 Không có câu nào cần ôn lại — cả nhóm nắm chắc hết.</p>')}

    ${sec('VI', `Chi tiết từng câu${opt.only ? ' <small>(chỉ những câu cần ôn)</small>' : ''}`, shown.map(qCard).join('') || '<p class="soft">Không có câu nào.</p>')}

    ${opt.chat && (d.general.length || d.allDocs.length) ? sec('VII', 'Phụ lục', `
        ${d.general.length ? `<h3>Thảo luận chung</h3><div class="chat">${d.general.map(m => `<div class="m"><p><b>${E(nm(m))}</b> <span class="soft">${hm(msTime(m) || Date.now())}</span></p>${m.text ? `<p>${talk(m.text)}</p>` : ''}${imgsHtml(m.images, opt.images)}</div>`).join('')}</div>` : ''}
        ${d.allDocs.length ? `<h3>Tài liệu tham khảo của buổi học</h3><ol class="refs">${d.allDocs.map(m => `<li><b>${E(plain(m.title) || 'Tài liệu')}</b>${m.src ? ` — ${E(plain(m.src))}` : ''}${typeof m.qIdx === 'number' ? ` <span class="soft">(câu ${m.qIdx + 1})</span>` : ''}${safeLink(m.link) ? `<br><a href="${E(m.link)}">${E(m.link)}</a>` : ''}</li>`).join('')}</ol>` : ''}`) : ''}

    <p class="endnote">Biên bản tạo tự động bởi Zitthenkne · phòng ${E(info.code)} · xuất bởi ${E(info.exportedBy)} lúc ${E(info.exportedAt)}</p>`;

    return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${E(fileName(d))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
${math ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css"><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>' : ''}
<style>${PRINT_CSS}</style></head>
<body data-math="${math ? 1 : 0}">
<div class="bar-top no-print"><span>Xem trước biên bản — bấm nút bên phải rồi chọn <b>Lưu dưới dạng PDF</b></span><button onclick="window.print()">🖨 In / Lưu PDF</button></div>
<main class="page">${body}</main>
<script>
(function () {
    function done() { document.body.setAttribute('data-ready', '1'); }
    if (document.body.getAttribute('data-math') !== '1') return done();
    window.addEventListener('load', function () {
        try {
            renderMathInElement(document.body, { delimiters: [
                { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
                { left: '\\\\(', right: '\\\\)', display: false }, { left: '\\\\[', right: '\\\\]', display: true }], throwOnError: false });
        } catch (e) {}
        done();
    });
})();
</script>
</body></html>`;
}

const PRINT_CSS = `
@page { size: A4; margin: 14mm 13mm 16mm;
    @bottom-left { content: "Zitthenkne · Biên bản buổi đánh đề"; font: 500 7.5pt 'Be Vietnam Pro', sans-serif; color: #a597b0; }
    @bottom-right { content: "Trang " counter(page) " / " counter(pages); font: 600 7.5pt 'Be Vietnam Pro', sans-serif; color: #a597b0; } }
:root { --ink:#2f2438; --muted:#85788f; --line:#ece2f0; --soft:#fbf7fb; --pink:#e5689a; --pink-soft:#ffedf4;
    --lav:#7d62cf; --lav-soft:#f3eeff; --ok:#23906a; --ok-soft:#e6f7ef; --bad:#cf3f67; --bad-soft:#ffedf2; --warn:#a96d16; --warn-soft:#fff5e5; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { background: #f4edf3; }
body { margin: 0; font: 400 9.6pt/1.58 'Be Vietnam Pro', system-ui, sans-serif; color: var(--ink); }
a { color: var(--lav); text-decoration: none; }
.page { max-width: 188mm; margin: 14px auto 40px; padding: 13mm 12mm; background: #fff; border-radius: 10px; box-shadow: 0 16px 50px -26px rgba(60,30,70,.45); }
.bar-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; justify-content: space-between;
    padding: 10px 16px; background: rgba(255,255,255,.94); border-bottom: 1px solid var(--line); font-size: 10pt; }
.bar-top button { font: 700 10pt 'Be Vietnam Pro', sans-serif; color: #fff; border: 0; border-radius: 999px; padding: 9px 18px; cursor: pointer;
    background: linear-gradient(135deg, #ff9cc4, #e5689a 55%, #b98be8); box-shadow: 0 8px 20px -10px #e5689a; }
.cover { border-radius: 14px; padding: 16px 20px 18px; background: linear-gradient(120deg, #ffe4f0, #f0e7ff 58%, #e2f6ee); border: 1px solid var(--line); }
.cover-top { display: flex; align-items: center; gap: 8px; font-size: 8pt; font-weight: 700; color: var(--muted); }
.cover-top img { width: 20px; height: 20px; border-radius: 6px; }
.cover-top em { margin-left: auto; font-style: normal; }
.kicker { margin: 12px 0 0; font-size: 8pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--pink); }
.cover h1 { margin: 3px 0 5px; font-size: 19pt; line-height: 1.2; font-weight: 800; letter-spacing: -.01em; }
.cover .sub { margin: 0; color: var(--muted); font-weight: 500; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 12px 0 4px; }
.kpi { border: 1px solid var(--line); border-radius: 10px; padding: 8px 11px; background: var(--soft); }
.kpi b { display: block; font-size: 15pt; font-weight: 800; line-height: 1.15; }
.kpi b small { font-size: 9pt; color: var(--muted); font-weight: 600; }
.kpi span { font-size: 7.8pt; color: var(--muted); font-weight: 600; }
.kpi.ok b { color: var(--ok); } .kpi.warn b { color: var(--warn); } .kpi.bad b { color: var(--bad); }
.sec { margin-top: 16px; }
h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding-bottom: 5px; font-size: 12.5pt; font-weight: 800;
    border-bottom: 2px solid var(--pink-soft); break-after: avoid; }
h2 small { font-size: 8.5pt; color: var(--muted); font-weight: 600; }
h2 .no { display: inline-grid; place-items: center; min-width: 24px; height: 22px; padding: 0 5px; border-radius: 7px; background: var(--pink); color: #fff; font-size: 8.5pt; }
h3 { font-size: 10.5pt; margin: 10px 0 5px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7.8pt; font-weight: 800; letter-spacing: .03em; color: #8c4e6a; background: var(--pink-soft); padding: 5px 7px; }
td { padding: 5px 7px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }
.c { text-align: center; } .r { text-align: right; }
table.info td:first-child { width: 30%; color: var(--muted); font-weight: 600; }
table.grid tr.top td { background: #fffaf2; }
.soft { color: var(--muted); } .muted { color: var(--muted); } .warn { color: var(--warn); } .bad { color: var(--bad); }
.mini { display: inline-block; font-size: 7pt; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: var(--warn-soft); color: var(--warn); }
.cap { margin: 5px 0 0; font-size: 7.6pt; color: var(--muted); }
.facts { margin: 0; padding-left: 16px; } .facts li { margin: 2px 0; }
.qmap { display: grid; grid-template-columns: repeat(15, 1fr); gap: 3px; margin-top: 5px; }
.qc { display: block; text-align: center; font-size: 7.5pt; font-weight: 800; padding: 3px 0; border-radius: 5px; color: #fff; }
.qc.ok { background: #56c29a; } .qc.diff { background: #e6a646; } .qc.low { background: #e7708f; } .qc.open { background: #ddd3e3; color: #6d6275; }
.todo { list-style: none; margin: 0; padding: 0; }
.todo li { position: relative; padding: 6px 8px 6px 28px; border: 1px solid var(--line); border-radius: 8px; margin: 4px 0; break-inside: avoid; }
.todo .box { position: absolute; left: 9px; top: 8px; width: 11px; height: 11px; border: 1.6px solid #c9b3d6; border-radius: 3px; }
.todo .stemmini { color: var(--muted); } .todo .why { font-size: 8.2pt; color: var(--warn); font-weight: 600; }
.ok-line { color: var(--ok); font-weight: 700; }
.q { border: 1px solid var(--line); border-radius: 12px; padding: 11px 13px 10px; margin: 10px 0 12px; break-inside: avoid; }
.src, .case { break-after: avoid; }
.chat .ql { display: block; margin: 2px 0; padding-left: 8px; border-left: 2px solid #d9c9ee; color: #5e5468; font-style: italic; }
.q-head { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; break-after: avoid; }
.q-no { font-size: 11.5pt; font-weight: 800; margin-right: 3px; }
.tag { display: inline-block; font-size: 7.4pt; font-weight: 700; padding: 1.5px 7px; border-radius: 99px; background: var(--soft); color: var(--muted); border: 1px solid var(--line); }
.tag.ok { background: var(--ok-soft); color: var(--ok); border-color: #bfe8d6; }
.tag.warn { background: var(--warn-soft); color: var(--warn); border-color: #f1d9ad; }
.tag.bad { background: var(--bad-soft); color: var(--bad); border-color: #f5c3d1; }
.tag.lav { background: var(--lav-soft); color: var(--lav); border-color: #ddd0fb; }
.src { margin: 4px 0 0; font-size: 7.8pt; color: var(--muted); }
.case { margin: 7px 0; padding: 7px 10px; border-radius: 8px; background: var(--warn-soft); border-left: 3px solid #f0b66b; }
.stem { margin: 7px 0 8px; font-size: 10.4pt; font-weight: 600; break-after: avoid; }
table.opts { margin-top: 2px; }
table.opts td.lt { width: 26px; } table.opts td.vt { width: 118px; white-space: nowrap; font-size: 8.4pt; } table.opts td.who { width: 26%; font-size: 8.2pt; color: var(--muted); }
.let { display: inline-grid; place-items: center; width: 19px; height: 19px; border-radius: 99px; background: #efe8f2; color: #6f607a; font-size: 7.8pt; font-weight: 800; }
.let.sm { width: 15px; height: 15px; font-size: 6.8pt; vertical-align: 1px; }
tr.is-chosen td { background: var(--ok-soft); } tr.is-chosen .let { background: var(--ok); color: #fff; } tr.is-chosen td.rich { font-weight: 700; }
tr.is-ref .let { background: #f2c56f; color: #fff; }
.bar { display: inline-block; width: 52px; height: 6px; margin-right: 6px; vertical-align: 1px; border-radius: 99px; background: var(--line); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--pink), var(--lav)); }
tr.is-chosen .bar i { background: var(--ok); }
.oexp { margin-top: 3px; font-size: 8.3pt; font-weight: 400; color: var(--muted); }
.verdict { margin: 8px 0 2px; padding: 6px 10px; border-radius: 8px; font-weight: 600; background: var(--ok-soft); color: #1f6e53; break-inside: avoid; }
.verdict.diff { background: var(--warn-soft); color: #87560f; } .verdict.open { background: var(--soft); color: var(--muted); }
.verdict .soft { font-weight: 500; }
.block { margin-top: 8px; break-inside: avoid; }
.block h4 { margin: 0 0 3px; font-size: 7.8pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #8c4e6a; }
.block h4 em { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--muted); }
.block.expl { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fffdfd; }
.call { padding: 7px 10px; border-radius: 8px; } .call.lav { background: var(--lav-soft); } .call.pink { background: var(--pink-soft); }
.rich p { margin: 3px 0; } .rich ul, .rich ol { margin: 3px 0 3px 16px; padding: 0; } .rich img { max-width: 100%; max-height: 85mm; border-radius: 6px; border: 1px solid var(--line); margin: 3px 0; }
.rich mark { background: #fff1a3; padding: 0 2px; border-radius: 3px; } .rich code { background: var(--pink-soft); padding: 0 4px; border-radius: 4px; font-size: .92em; }
.rich table { border: 1px solid var(--line); margin: 4px 0; } .rich table td, .rich table th { border: 1px solid var(--line); }
.rich.inl p { display: inline; margin: 0; }
.reasons { list-style: none; margin: 0; padding: 0; } .reasons li { padding: 3px 0; border-bottom: 1px dashed var(--line); }
.camp { margin: 5px 0; padding: 6px 9px; border-radius: 8px; background: #fff8fb; border: 1px solid var(--line); break-inside: avoid; }
.camp.ok { background: var(--ok-soft); border-color: #bfe8d6; } .camp-h { margin: 0 0 3px; }
.args { list-style: none; margin: 4px 0 0; padding: 0; } .args li { padding: 2px 0; font-size: 8.6pt; }
.arg .aic { display: inline-block; width: 14px; text-align: center; font-weight: 800; } .arg.pro .aic { color: var(--ok); } .arg.con .aic { color: var(--bad); }
.qc.essay { background: var(--lav-soft); color: var(--lav); }
.docref { padding: 6px 9px; border-radius: 8px; background: var(--lav-soft); border: 1px solid #e3d8fb; margin: 4px 0; }
.docref p { margin: 1px 0; } .docref blockquote { margin: 4px 0; padding: 2px 0 2px 9px; border-left: 3px solid #cbb8f6; color: #4d4458; font-style: italic; }
.docref .link { font-size: 8pt; word-break: break-all; }
.chat .m { padding: 4px 0 4px 9px; border-left: 2px solid #eadcf6; margin: 3px 0; break-inside: avoid; }
.chat .m p { margin: 1px 0; }
.imgs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; } .imgs img { max-width: 48%; max-height: 62mm; border-radius: 6px; border: 1px solid var(--line); object-fit: contain; }
.noimg { color: var(--muted); font-size: 8pt; }
.notes { margin: 8px 0 0; padding-top: 6px; border-top: 1px dashed var(--line); font-size: 8.2pt; color: var(--muted); }
.notes .dot { margin: 0 6px; color: #d5c7dc; }
.refs { margin: 0; padding-left: 18px; } .refs li { margin: 3px 0; word-break: break-word; }
.endnote { margin: 18px 0 0; padding-top: 8px; border-top: 1px solid var(--line); text-align: center; font-size: 7.8pt; color: var(--muted); }
@media print {
    html { background: #fff; }
    .no-print { display: none !important; }
    .page { max-width: none; margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
    a { color: inherit; }
}
@media screen and (max-width: 700px) { .page { margin: 0; border-radius: 0; padding: 16px 14px; } .kpis { grid-template-columns: repeat(2, 1fr); } .qmap { grid-template-columns: repeat(10, 1fr); } table.opts td.who { display: none; } }
`;

// ================= 4. XUẤT =================
function fileName(d) {
    const slug = String(d.info.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'phong';
    const t = new Date();
    return `bien-ban-${slug}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
}

const readOpts = () => ({
    chat: el('min-chat')?.checked !== false,
    reasons: el('min-reasons')?.checked !== false,
    images: el('min-images')?.checked !== false,
    only: !!el('min-only')?.checked,
});

async function build() {
    if (!room.session?.questions?.length) throw new Error('no-session');
    const msgs = await loadMessages();
    return collect(msgs, readOpts());
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function settle(doc) {
    const imgs = [...doc.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const ready = new Promise(r => {
        const tick = () => (doc.body?.getAttribute('data-ready') === '1' ? r() : setTimeout(tick, 120));
        tick();
    });
    await Promise.race([Promise.all([doc.fonts?.ready, ready, ...imgs]), sleep(9000)]);
}

/** In qua iframe ẩn (máy tính) — hộp in của trình duyệt mở ra, chọn "Lưu dưới dạng PDF". */
async function printViaFrame(html, name) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    await new Promise(r => { frame.onload = r; frame.srcdoc = html; });
    await settle(frame.contentDocument);
    const old = document.title;
    document.title = name;                       // Chrome lấy tên file PDF từ tiêu đề trang
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally {
        setTimeout(() => { document.title = old; frame.remove(); }, 1200);
    }
}

/** Mở bản xem trong tab mới (điện thoại in từ đây; máy tính dùng để đọc lướt). Tab phải mở
 *  NGAY trong cú bấm, trước mọi await, kẻo trình duyệt chặn cửa sổ bật lên. */
function openTab() {
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font:16px system-ui;padding:24px;color:#85788f">Đang dựng biên bản…</p>');
    return w;
}
function fillTab(w, html) {
    if (!w) return showToast('Trình duyệt chặn tab mới — cho phép cửa sổ bật lên rồi thử lại.', 'warning', 4500);
    w.document.open();
    w.document.write(html);
    w.document.close();
}

function download(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function run(kind) {
    const phone = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
    const tab = (kind === 'view' || (kind === 'pdf' && phone)) ? openTab() : null;
    const btn = el(`min-${kind}`);
    btn?.classList.add('is-busy');
    try {
        const d = await build();
        const name = fileName(d);
        if (kind === 'md') {
            download(buildMarkdown(d), name + '.md', 'text/markdown;charset=utf-8');
            showToast('Đã tải biên bản Markdown.', 'success');
        } else if (kind === 'copy') {
            await navigator.clipboard.writeText(buildMarkdown(d));
            showToast('Đã chép Markdown — dán vào Obsidian / Notion / nhóm chat.', 'success');
        } else if (tab) {
            fillTab(tab, buildHtml(d));
            if (kind === 'pdf') showToast('Bấm "In / Lưu PDF" ở đầu trang vừa mở.', 'info', 4000);
        } else {
            showToast('Đang mở hộp in — chọn "Lưu dưới dạng PDF".', 'info', 3000);
            await printViaFrame(buildHtml(d), name);
        }
    } catch (err) {
        tab?.close();
        console.error('Lỗi xuất biên bản:', err);
        showToast(err?.message === 'no-session' ? 'Chưa có phiên đánh đề nào để lập biên bản.' : 'Không xuất được biên bản — thử lại nhé.', 'error');
    } finally {
        btn?.classList.remove('is-busy');
    }
}

// ================= 5. HỘP CHỌN =================
function paintSummary() {
    const box = el('min-summary');
    const s = room.session;
    if (!box || !s?.questions?.length) return;
    const total = s.questions.length;
    const announced = s.questions.filter((_, i) => acceptedOf(i).length).length;
    const msgs = chatMessages().filter(m => m.type !== 'notice');
    box.innerHTML = [
        [`${announced}/${total}`, 'câu đã chốt'],
        [room.members.length, 'thành viên'],
        [msgs.filter(m => m.type === 'chat').length, 'ý kiến thảo luận'],
        [msgs.filter(m => m.type === 'doc').length + msgs.reduce((n, m) => n + (m.images?.length || 0), 0), 'tài liệu & ảnh'],
    ].map(([v, t]) => `<div><b>${v}</b><span>${t}</span></div>`).join('');
}

export function openMinutes() {
    if (!room.session?.questions?.length) return showToast('Chưa có phiên đánh đề nào để lập biên bản.', 'warning');
    paintSummary();
    el('minutes-modal')?.classList.remove('hidden');
}

export function initMinutes() {
    const modal = el('minutes-modal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-min]')) return void modal.classList.add('hidden');
        const b = e.target.closest('[data-min]');
        if (b && !b.classList.contains('is-busy')) run(b.dataset.min);
    });
}
