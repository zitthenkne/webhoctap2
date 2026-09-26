// room-minutes.js — BIÊN BẢN BUỔI HỌC: gom đủ dữ liệu một phiên rồi xuất 2 dạng
//   · PDF  — trang in A4 dựng riêng (bìa, thẻ số liệu, bảng, thẻ từng câu, số trang) rồi gọi hộp
//            in của trình duyệt -> "Lưu dưới dạng PDF". Không dùng jsPDF: chữ tiếng Việt, ảnh và
//            công thức đều đẹp hơn khi để trình duyệt tự dàn trang, chữ trong PDF còn bôi đen được.
//   · Markdown (.md) — cùng bố cục, dán thẳng vào Obsidian / Notion / nhóm chat.
// Bố cục GỌN (bản 33 — người dùng: "chỉ hiển thị cái thật sự cần, tránh loãng"):
//   đầu trang (1 dòng thông tin · thành viên · 4 chỉ số · xếp hạng 1 dòng) · 🎯 Cần ôn lại · 📝 Từng câu
//   (đề · phương án + giải thích từng ý · giải thích chung · mở rộng/ghi nhớ · ý chính khi bàn ≤3 · nguồn).
//   Tuỳ chọn "Bản đầy đủ" thêm: ai chọn gì + lý do, toàn bộ nhận xét/chat, ghi nhận phụ, mức độ tham gia.
//   ĐÃ BỎ khỏi bản gọn: bảng "Thông tin chung" (lặp đầu trang), "Tóm tắt kết quả" (lặp thẻ số liệu),
//   bảng 8 cột tham gia (toàn dấu —), dòng kết luận (lặp nhãn đầu câu), cột "Ai chọn", chat từng câu.
import { getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from '../../core/utils.js';
import { stripOptionLabels } from '../quiz/quiz-helpers.js';
import {
    room, refs, optsOf, refIdxOf, chosenOf, noteOf, noteAuthorOf, optNoteOf, issueOf, whyOf, dissentOf,
    answerOf, questionAt, isCoop, editOf, prevVoteOf, explainerOf, thanksOf,
    caseKeyAt,
    acceptedOf, isSplit, isEssay, argsOf, agreeCount,
} from './room-state.js';
import { computeScores, questionStats } from './room-scoreboard.js';
import { renderRich, sanitizeHtml } from './room-editor.js';
import { mermaidSvg, fixMermaidCode } from '../quiz/quiz-helpers.js';
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
            noteBy: noteOf(i) ? noteAuthorOf(i)?.name || '' : (q.explanation || q.explain ? 'theo file' : ''),
            optNotes: opts.map((_, k) => optNoteOf(i, k) || (q.optionExplanations?.[k] || '')),
            chats: talkers.filter(m => m.type === 'chat' && m.qIdx === i),
            docs: talkers.filter(m => m.type === 'doc' && m.qIdx === i),
        };
        x.status = essay ? 'essay' : split ? 'split' : !accepted.length ? 'open' : ref === null ? 'nofile' : accepted.includes(ref) ? 'match' : 'diff';
        // Ý chính khi bàn (bản gọn): thắc mắc CHƯA giải đáp luôn giữ; còn lại lấy lập luận có lập trường
        // (✚ ✖ 📚 ❓) hoặc nhận xét được đồng tình, nhiều 👍 lên trước. Tự luận: nhận xét chính là nội dung.
        const openAsk = args.filter(a => a.s === 'ask' && !a.ok);
        const rest = args.filter(a => !openAsk.includes(a) && (essay || a.s !== 'cmt' || agreeCount(a.id) > 0));
        x.keyArgs = [...openAsk, ...rest].slice(0, Math.max(essay ? 6 : 3, openAsk.length));
        // Chưa ai viết giải thích -> mượn tối đa 2 lý do của người chọn đúng, kẻo câu chỉ trơ đáp án
        const hasExp = plain(x.note) || /<img/i.test(x.note) || x.optNotes.some(t => plain(t));
        x.bestWhy = hasExp || !accepted.length ? [] : x.reasons.filter(r => accepted.includes(r.k)).slice(0, 2);
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
        announced: qs.filter(x => !x.essay && x.accepted.length).length,   // trước đây đếm cả tự luận -> "4/3"
        essays: qs.filter(x => x.essay).length,
        mcq: qs.filter(x => !x.essay).length,
        avg: graded.length ? Math.round(graded.reduce((a, x) => a + x.pctRight, 0) / graded.length) : null,
        diff: qs.filter(x => x.status === 'diff'),
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
const looksHtml = (v) => /<(b|strong|i|em|u|mark|code|br|div|p|ul|ol|li|span|img|a|table|h4|hr)\b/i.test(String(v || ''));
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
            case 'P': case 'DIV': {
                const mm = n.getAttribute('data-mermaid');
                if (mm) { let c = ''; try { c = decodeURIComponent(mm); } catch (e) {} return c ? '\n```mermaid\n' + c.trim() + '\n```\n' : ''; }
                return '\n' + inner().trim() + '\n';
            }
            case 'LI': return '\n- ' + inner().trim();
            case 'UL': case 'OL': return '\n' + inner() + '\n';
            case 'IMG': { const u = n.getAttribute('src') || ''; return u.startsWith('data:') ? '*(ảnh nhúng — xem bản PDF)*' : `![ảnh](${u})`; }
            case 'A': return `[${inner().trim() || 'link'}](${n.getAttribute('href')})`;
            case 'H4': return '\n#### ' + inner().trim() + '\n';
            case 'HR': return '\n---\n';
            case 'TABLE': {   // bảng nhóm tự tạo trong sổ tay (bản 28) -> bảng Markdown
                const rows = [...n.querySelectorAll('tr')].map(tr => [...tr.children].map(c => [...c.childNodes].map(walk).join('').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || ' '));
                if (!rows.length) return '';
                const w = Math.max(...rows.map(r => r.length));
                rows.forEach(r => { while (r.length < w) r.push(' '); });
                return '\n' + [rows[0], Array(w).fill('---'), ...rows.slice(1)].map(r => `| ${r.join(' | ')} |`).join('\n') + '\n';
            }
            default: return inner();
        }
    };
    return walk(box).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const md = (v) => { const t = String(v ?? '').trim(); return !t ? '' : looksHtml(t) ? htmlToMd(t) : t; };
const cell = (v) => md(v).replace(/\|/g, '\\|').replace(/\n+/g, '<br>') || ' ';
const quoteMd = (v) => md(v).split('\n').map(l => '> ' + l).join('\n');
const imgsMd = (list, on) => on ? (list || []).map(im => safeImgUrl(im.u)).filter(u => u && !u.startsWith('data:')).map(u => `![ảnh](${u})`).join(' ') : '';
const hasRich = (v) => !!plain(v) || /<img/i.test(String(v || ''));
const IC = { pro: '✚', con: '✖', ask: '❓', src: '📚', cmt: '💬' };
const MEDAL = ['🥇', '🥈', '🥉'];

// Nhãn đầu mỗi câu — dùng chung cho MD và PDF: kết luận · % đúng · lệch file (chỉ khi lệch)
function verdictOf(x) {
    if (x.essay) return '✍️ tự luận';
    if (x.split) return '🤝 chưa thống nhất';
    if (!x.accepted.length) return '⏳ chưa chốt';
    return `✅ ${x.accepted.map(L).join(' + ')}`;
}
const argText = (a) => `${a.qt ? `“${String(a.qt).replace(/\n/g, ' ')}” — ` : ''}${String(a.t || '').replace(/\n/g, ' ')}`;

function buildMarkdown(d) {
    const { info, summary: S, opt } = d;
    const out = [];
    const push = (...l) => out.push(...l);
    const todo = d.qs.filter(x => x.review.length);

    // --- Đầu biên bản: 1 dòng thông tin + 1 dòng kết quả + 1 dòng xếp hạng ---
    push(`# 📋 ${info.title}`, '',
        `${info.room} · ${info.date} · ${info.from}–${info.to} (${info.minutes} phút) · ${d.members.length} người · ${S.total} câu · chủ trì ${info.host}${info.ended ? '' : ' · *phiên chưa kết thúc*'}`, '',
        `**Thành viên:** ${d.members.map(nm).join(', ')}`);
    if (plain(info.goal)) push(`**Mục tiêu:** ${md(info.goal).replace(/\n+/g, ' ')}`);
    push('', `**Kết quả:** ${kpiLine(S, todo).join(' · ')}`);
    if (S.announced && d.scores.length) push(`**Xếp hạng:** ${d.scores.map(r => `${MEDAL[r.rank - 1] || r.rank + '.'} ${r.name} ${r.points}`).join(' · ')}`);
    push('');

    push(`## 🎯 Cần ôn lại (${todo.length})`, '');
    if (todo.length) todo.forEach(x => push(`- [ ] **Câu ${x.i + 1}** — ${x.review.join(' · ')}`));
    else push('Không có câu nào cần ôn lại 🎉');
    push('');

    push(`## 📝 Từng câu${opt.only ? ' (chỉ câu cần ôn)' : ''}`, '');
    const caseSeen = new Map();   // ca chùm: in đầy đủ ở câu đầu tiên, các câu sau chỉ trỏ về
    d.qs.filter(x => !opt.only || x.review.length).forEach(x => {
        const q = x.q;
        const head = [verdictOf(x), x.pctRight !== null ? `${x.pctRight}% đúng` : '', x.status === 'diff' ? `⚠ file ghi ${L(x.ref)}` : ''].filter(Boolean);
        push(`### Câu ${x.i + 1} · ${head.join(' · ')}`);
        const meta = [q.topic && String(q.topic).toLowerCase() !== 'chung' ? plain(q.topic) : '', q.source ? plain(q.source) : ''].filter(Boolean);
        if (meta.length) push(`*${meta.join(' · ')}*`);
        push('');
        const caseText = q.caseText || q.case;
        const ck = caseKeyAt(x.i);
        if (caseText && caseSeen.has(ck)) push(`> *${plain(q.caseTitle) || 'Ca lâm sàng'} — như câu ${caseSeen.get(ck) + 1}*`, '');
        else if (caseText) {
            if (ck) caseSeen.set(ck, x.i);
            push(`> **${plain(q.caseTitle) || 'Ca lâm sàng'}:** ${md(caseText).replace(/\n/g, '\n> ')}`, '');
        }
        push(md(q.question), '');
        if (!x.essay) {
            x.opts.forEach((o, k) => {
                const ok = x.accepted.includes(k);
                const n = x.st.counts[k] || 0;
                const tags = [!x.accepted.length && x.ref === k ? '📄 đáp án file' : '', opt.full && n ? `${n} chọn` : ''].filter(Boolean).join(' · ');
                push(`- ${ok ? '✅ ' : ''}**${L(k)}.** ${ok ? `**${md(o).replace(/\n/g, ' ')}**` : md(o).replace(/\n/g, ' ')}${tags ? ` — ${tags}` : ''}`);
                if (hasRich(x.optNotes[k])) push(`  - ${md(x.optNotes[k]).replace(/\n/g, ' ')}`);
            });
            push('');
        }
        if (x.dissent.length) push(`✋ **Bảo lưu:** ${x.dissent.map(m => `${nm(m)} (${L(answerOf(m, x.i)?.i ?? 0)})`).join(', ')}`, '');
        if (hasRich(x.note)) push(`**${x.essay ? '✍️ Bài làm chung' : '💡 Giải thích'}**${x.noteBy ? ` *(${x.noteBy})*` : ''}`, quoteMd(x.note), '');
        else if (x.bestWhy.length) push(`**💡 Lý do phe đúng:** ${x.bestWhy.map(r => `${nm(r.m)}: ${md(r.why).replace(/\n/g, ' ')}`).join(' · ')}`, '');
        if (q.expanded) push(`**📖 Mở rộng:** ${md(q.expanded)}`, '');
        if (q.note) push(`**📌 Ghi nhớ:** ${md(q.note)}`, '');
        if (!opt.full && x.keyArgs.length) {
            push(x.essay ? '**🗣 Nhận xét**' : '**🗣 Ý chính khi bàn**');
            x.keyArgs.forEach(a => push(`- ${IC[a.s] || '•'} **${nm(a.member)}:** ${argText(a)}${agreeCount(a.id) ? ` (👍 ${agreeCount(a.id)})` : ''}${a.s === 'ask' && !a.ok ? ' — ⏳ *chưa giải đáp*' : ''}`));
            push('');
        }
        if (x.docs.length) {
            push('**📚 Nguồn**');
            x.docs.forEach(m => {
                push(`- ${plain(m.title) || 'Tài liệu'}${m.src ? ` — ${plain(m.src)}` : ''}${safeLink(m.link) ? ` · [link](${m.link})` : ''}`);
                if (m.text) push(`  > ${String(m.text).replace(/\n/g, '\n  > ')}`);
                const im = imgsMd(m.images, opt.images);
                if (im) push(`  ${im}`);
            });
            push('');
        }
        if (plain(x.issue)) push(`⚠ **Báo lỗi đề:** ${plain(x.issue)}`, '');
        if (opt.full) fullMd(x, opt, push);
        push('---', '');
    });

    const loose = d.allDocs.filter(m => typeof m.qIdx !== 'number');
    if (loose.length) {
        push('## 📚 Tài liệu chung', '');
        loose.forEach(m => push(`- ${plain(m.title) || 'Tài liệu'}${m.src ? ` — ${plain(m.src)}` : ''}${safeLink(m.link) ? ` · ${m.link}` : ''}`));
        push('');
    }
    if (opt.full) {
        push('## Phụ lục · Mức độ tham gia', '', '| Thành viên | Đã làm | Đoán | Ghi lý do | Ý kiến | Nhận giảng | Muốn bàn |', '|---|:-:|:-:|:-:|:-:|:-:|:-:|');
        d.participation.forEach(p => push(`| ${cell(nm(p.m))} | ${p.done}/${S.total} | ${p.guess} | ${p.why} | ${p.talk} | ${p.giang} | ${p.flags} |`));
        push('');
        if (d.general.length) {
            push('## Phụ lục · Thảo luận chung', '');
            d.general.forEach(m => push(`- **${nm(m)}** · ${hm(msTime(m) || Date.now())}: ${String(m.text || '').replace(/\n/g, ' ')} ${imgsMd(m.images, opt.images)}`.trimEnd()));
            push('');
        }
    }
    push(`*Zitthenkne · phòng ${info.code} · xuất bởi ${info.exportedBy} lúc ${info.exportedAt}*`);
    return out.join('\n');
}

// Bản đầy đủ: ai chọn gì + lý do, mọi nhận xét, đổi ý, chat, ghi nhận phụ
function fullMd(x, opt, push) {
    const argMd = (a) => `${IC[a.s] || '•'} **${nm(a.member)}**: ${argText(a)}${a.im?.length ? ` 🖼×${a.im.length}` : ''}${agreeCount(a.id) ? ` (👍 ${agreeCount(a.id)})` : ''}${a.s === 'ask' ? (a.ok ? ' ✅ đã giải đáp' : ' ⏳ chưa giải đáp') : ''}`;
    if (x.camps.length || x.looseArgs.length) {
        push(x.essay ? '**🗣 Nhận xét bài làm chung**' : '**🗣 Ai chọn gì & lý do**');
        x.camps.forEach(c => {
            push(`- **${L(c.k)}**${c.ok ? ' ✅' : ''} — ${c.who.length} người${c.who.length ? ': ' + c.who.map(m => {
                const a = answerOf(m, x.i);
                const tag = [typeof a.from === 'number' && a.from !== a.i ? `đổi từ ${L(a.from)}${a.by?.n ? ` nhờ ${a.by.n}` : ''}` : '', a.guess ? 'đoán' : ''].filter(Boolean).join(', ');
                const w = md(whyOf(m, x.i)).replace(/\n/g, ' ');
                return `${nm(m)}${tag ? ` *(${tag})*` : ''}${w ? ` — "${w}"` : ''}`;
            }).join('; ') : ''}`);
            [...c.pro, ...c.con, ...c.other].forEach(a => push(`  - ${argMd(a)}`));
        });
        x.looseArgs.forEach(a => push(`- ${argMd(a)}`));
        if (x.changers.length) push(`- 🔄 Đổi ý sau khi bàn: ${x.changers.map(m => { const a = answerOf(m, x.i); return `${nm(m)} (${L(a.from)} → ${L(a.i)})`; }).join(', ')}`);
        push('');
    }
    if (x.chats.length) {
        push(`**💬 Thảo luận** (${x.chats.length})`);
        x.chats.forEach(m => {
            const im = imgsMd(m.images, opt.images);
            push(`- **${nm(m)}**${typeof m.ans === 'number' ? ` *(chọn ${L(m.ans)})*` : ''} · ${hm(msTime(m) || Date.now())}: ${String(m.text || '').replace(/\n/g, '\n  ')}${im ? '\n  ' + im : ''}`);
        });
        push('');
    }
    const notes = extraNotes(x, (l) => l.map(nm).join(', '));
    if (notes.length) push(`*${notes.join(' · ')}*`, '');
}
function extraNotes(x, names) {
    return [
        x.flagged.length ? `🗣 cần bàn: ${names(x.flagged)}` : '',
        x.unclear.length ? `🤔 chưa hiểu: ${names(x.unclear)}` : '',
        x.guess.length ? `🎲 đoán: ${names(x.guess)}` : '',
        (x.diff.easy + x.diff.ok + x.diff.hard) ? `độ khó: ${Object.entries(x.diff).filter(([, n]) => n).map(([k, n]) => `${DIFF[k]} ${n}`).join(' · ')}` : '',
        x.explainer?.name ? `🎙 giảng: ${x.explainer.name}${x.thanks ? ` (💖 ${x.thanks})` : ''}` : '',
        x.prev ? `🔁 vòng bầu trước: ${x.prev.map((n, k) => `${L(k)} ${n}`).join(' · ')}` : '',
    ].filter(Boolean);
}
// Dòng kết quả: chỉ số nói được điều gì mới giữ lại
function kpiLine(S, todo) {
    return [
        `chốt ${S.announced}/${S.mcq} câu${S.essays ? ` + ${S.essays} tự luận` : ''}`,
        S.avg !== null ? `đúng trung bình ${S.avg}%` : '',
        `${todo.length} câu cần ôn`,
        S.diff.length ? `${S.diff.length} câu lệch đáp án file` : '',
    ].filter(Boolean);
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
    const todo = d.qs.filter(x => x.review.length);
    const shown = d.qs.filter(x => !opt.only || x.review.length);
    const sec = (title, body) => `<section class="sec"><h2>${title}</h2>${body}</section>`;
    const kpi = (v, t, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><span>${t}</span></div>`;
    const argLi = (a) => `<li class="arg ${a.s}"><span class="aic">${IC[a.s] || '•'}</span> <b>${E(nm(a.member))}:</b> ${a.qt ? `<i class="soft">“${E(a.qt)}”</i> — ` : ''}${E(a.t || '')}${agreeCount(a.id) ? ` <span class="soft">👍 ${agreeCount(a.id)}</span>` : ''}${a.s === 'ask' ? ` <span class="mini ${a.ok ? 'ok' : ''}">${a.ok ? 'đã giải đáp' : 'chưa giải đáp'}</span>` : ''}</li>`;

    const caseSeen = new Map();   // ca chùm: in đầy đủ ở câu đầu tiên, các câu sau chỉ trỏ về
    const qCard = (x) => {
        const q = x.q;
        const caseText = q.caseText || q.case;
        const head = [
            chipHtml(verdictOf(x), x.essay ? '' : x.split ? 'warn' : x.accepted.length ? 'ok' : 'muted'),
            x.pctRight !== null ? chipHtml(`${x.pctRight}% đúng`, x.pctRight < 50 ? 'bad' : '') : '',
            x.status === 'diff' ? chipHtml(`⚠ file ghi ${L(x.ref)}`, 'warn') : '',
        ].join('');
        const meta = [q.topic && String(q.topic).toLowerCase() !== 'chung' ? plain(q.topic) : '', q.source ? plain(q.source) : ''].filter(Boolean);
        const rows = x.essay ? '' : `<ol class="opts">${x.opts.map((o, k) => {
            const ok = x.accepted.includes(k);
            const ref = !x.accepted.length && x.ref === k;
            const n = x.st.counts[k] || 0;
            return `<li class="${ok ? 'is-ok' : ''} ${ref ? 'is-ref' : ''}">
                <span class="let">${L(k)}</span>
                <div class="otx"><div class="rich">${rich(o, opt.images)}${ref ? ' <span class="mini">đáp án file</span>' : ''}</div>${hasRich(x.optNotes[k]) ? `<div class="oexp rich">${rich(x.optNotes[k], opt.images)}</div>` : ''}</div>
                ${opt.full && n ? `<span class="cnt">${n} chọn</span>` : ''}
            </li>`;
        }).join('')}</ol>`;
        const blocks = [];
        if (x.dissent.length) blocks.push(`<p class="line">✋ <b>Bảo lưu:</b> ${x.dissent.map(m => `${E(nm(m))} (${L(answerOf(m, x.i)?.i ?? 0)})`).join(', ')}</p>`);
        if (hasRich(x.note)) blocks.push(`<div class="block expl"><h4>${x.essay ? '✍️ Bài làm chung' : '💡 Giải thích'}${x.noteBy ? ` <em>· ${E(x.noteBy)}</em>` : ''}</h4><div class="rich">${rich(x.note, opt.images)}</div></div>`);
        else if (x.bestWhy.length) blocks.push(`<div class="block expl"><h4>💡 Lý do phe đúng</h4>${x.bestWhy.map(r => `<p><b>${E(nm(r.m))}:</b> <span class="rich inl">${rich(r.why, opt.images)}</span></p>`).join('')}</div>`);
        const calls = [q.expanded ? `<div class="call peach"><h4>📖 Mở rộng</h4><div class="rich">${rich(q.expanded, opt.images)}</div></div>` : '',
            q.note ? `<div class="call pink"><h4>📌 Ghi nhớ</h4><div class="rich">${rich(q.note, opt.images)}</div></div>` : ''].filter(Boolean);
        if (calls.length) blocks.push(`<div class="calls n${calls.length}">${calls.join('')}</div>`);
        if (!opt.full && x.keyArgs.length) blocks.push(`<div class="block"><h4>${x.essay ? '🗣 Nhận xét' : '🗣 Ý chính khi bàn'}</h4><ul class="args">${x.keyArgs.map(argLi).join('')}</ul></div>`);
        if (x.docs.length) blocks.push(`<div class="block"><h4>📚 Nguồn</h4>${x.docs.map(m => `<div class="docref">
            <p><b>${E(plain(m.title) || 'Tài liệu')}</b>${m.src ? ` — ${E(plain(m.src))}` : ''}${safeLink(m.link) ? ` · <a href="${E(m.link)}">link</a>` : ''}</p>
            ${m.text ? `<blockquote>${E(m.text).replace(/\n/g, '<br>')}</blockquote>` : ''}${imgsHtml(m.images, opt.images)}</div>`).join('')}</div>`);
        if (plain(x.issue)) blocks.push(`<p class="line bad">⚠ <b>Báo lỗi đề:</b> ${E(plain(x.issue))}</p>`);
        if (opt.full) blocks.push(fullHtml(x, opt, argLi));
        const ck = caseKeyAt(x.i);
        let caseHtml = '';
        if (caseText && caseSeen.has(ck)) {
            const n = caseSeen.get(ck) + 1;
            caseHtml = `<p class="case soft"><b>${E(plain(q.caseTitle) || 'Ca lâm sàng')}</b> — như <a href="#cau-${n}">câu ${n}</a></p>`;
        } else if (caseText) {
            if (ck) caseSeen.set(ck, x.i);
            caseHtml = `<div class="case"><b>${E(plain(q.caseTitle) || 'Ca lâm sàng')}</b><div class="rich">${rich(caseText, opt.images)}</div></div>`;
        }
        return `<article class="q" id="cau-${x.i + 1}">
            <div class="q-head"><span class="q-no">Câu ${x.i + 1}</span>${head}${meta.length ? `<span class="meta">${E(meta.join(' · '))}</span>` : ''}</div>
            ${caseHtml}
            <div class="stem rich">${rich(q.question, opt.images)}</div>
            ${rows}
            ${blocks.join('')}
        </article>`;
    };

    const loose = d.allDocs.filter(m => typeof m.qIdx !== 'number');
    const body = `
    <header class="cover">
        <div class="cover-top"><img src="${E(logo)}" alt=""><span>Biên bản buổi đánh đề</span><em>${E(info.date)} · ${info.from}–${info.to}</em></div>
        <h1>${E(info.title)}</h1>
        <p class="sub">${E(info.room)} · ${info.minutes} phút · ${d.members.length} người · ${S.total} câu · chủ trì ${E(info.host)}${info.ended ? '' : ' · <span class="mini">phiên chưa kết thúc</span>'}</p>
        <p class="sub2"><b>Thành viên:</b> ${who(d.members)}${plain(info.goal) ? `<br><b>Mục tiêu:</b> ${E(plain(info.goal))}` : ''}</p>
    </header>

    <div class="kpis">
        ${kpi(`${S.announced}<small>/${S.mcq}</small>`, S.essays ? `câu đã chốt · ${S.essays} tự luận` : 'câu đã chốt')}
        ${kpi(S.avg === null ? '—' : S.avg + '%', 'đúng trung bình', S.avg !== null && S.avg < 50 ? 'bad' : 'ok')}
        ${kpi(todo.length, 'câu cần ôn lại', todo.length ? 'warn' : 'ok')}
        ${S.diff.length ? kpi(S.diff.length, 'câu lệch đáp án file', 'warn') : kpi(`${S.people}<small>/${d.members.length}</small>`, 'người làm bài')}
    </div>
    ${S.announced && d.scores.length ? `<p class="rank"><span class="rk-l">Xếp hạng</span>${d.scores.map(r => `<span class="rk ${r.rank === 1 ? 'top' : ''}">${MEDAL[r.rank - 1] || r.rank + '.'} <b>${E(r.name)}</b> ${r.points}</span>`).join('')}</p>` : ''}
    ${S.total >= 6 ? `<div class="qmap">${d.qs.map(x => `<a href="#cau-${x.i + 1}" class="qc ${x.essay ? 'essay' : x.split || x.status === 'diff' ? 'diff' : !x.accepted.length ? 'open' : x.pctRight !== null && x.pctRight < 50 ? 'low' : 'ok'}">${x.i + 1}</a>`).join('')}</div>
    <p class="cap">xanh: ổn · đỏ: dưới 50% đúng · vàng: lệch file / chưa thống nhất · xám: chưa chốt</p>` : ''}

    ${sec(`🎯 Cần ôn lại <small>${todo.length} câu</small>`, todo.length ? `<ul class="todo">${todo.map(x => `<li><span class="box"></span><a href="#cau-${x.i + 1}"><b>Câu ${x.i + 1}</b></a> <span class="stemmini">${E(plain(x.q.question).slice(0, 110))}${plain(x.q.question).length > 110 ? '…' : ''}</span><br><span class="why">${x.review.join(' · ')}</span></li>`).join('')}</ul>`
        : '<p class="ok-line">🎉 Không có câu nào cần ôn lại.</p>')}

    ${sec(`📝 Từng câu${opt.only ? ' <small>chỉ câu cần ôn</small>' : ''}`, shown.map(qCard).join('') || '<p class="soft">Không có câu nào.</p>')}

    ${loose.length ? sec('📚 Tài liệu chung', `<ol class="refs">${loose.map(m => `<li><b>${E(plain(m.title) || 'Tài liệu')}</b>${m.src ? ` — ${E(plain(m.src))}` : ''}${safeLink(m.link) ? `<br><a href="${E(m.link)}">${E(m.link)}</a>` : ''}</li>`).join('')}</ol>`) : ''}

    ${opt.full ? sec('Phụ lục · Mức độ tham gia', `<table class="grid"><thead><tr><th>Thành viên</th><th class="c">Đã làm</th><th class="c">Đoán</th><th class="c">Ghi lý do</th><th class="c">Ý kiến</th><th class="c">Nhận giảng</th><th class="c">Muốn bàn</th></tr></thead><tbody>
        ${d.participation.map(p => `<tr><td><b>${E(nm(p.m))}</b></td><td class="c">${p.done}/${S.total}</td><td class="c">${p.guess || '—'}</td><td class="c">${p.why || '—'}</td><td class="c">${p.talk || '—'}</td><td class="c">${p.giang || '—'}</td><td class="c">${p.flags || '—'}</td></tr>`).join('')}
        </tbody></table>`) : ''}
    ${opt.full && d.general.length ? sec('Phụ lục · Thảo luận chung', `<div class="chat">${d.general.map(m => `<div class="m"><p><b>${E(nm(m))}</b> <span class="soft">${hm(msTime(m) || Date.now())}</span></p>${m.text ? `<p>${talk(m.text)}</p>` : ''}${imgsHtml(m.images, opt.images)}</div>`).join('')}</div>`) : ''}

    <p class="endnote">Zitthenkne · phòng ${E(info.code)} · xuất bởi ${E(info.exportedBy)} lúc ${E(info.exportedAt)}</p>`;

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

// Bản đầy đủ (PDF): ai chọn gì + lý do, mọi nhận xét, chat, ghi nhận phụ
function fullHtml(x, opt, argLi) {
    const out = [];
    if (x.camps.length || x.looseArgs.length) out.push(`<div class="block"><h4>${x.essay ? '🗣 Nhận xét bài làm chung' : '🗣 Ai chọn gì & lý do'}</h4>${x.camps.map(c => `<div class="camp ${c.ok ? 'ok' : ''}">
        <p class="camp-h"><span class="let sm">${L(c.k)}</span> ${c.who.length} người${c.ok ? ' <span class="tag ok">đúng</span>' : ''}</p>
        ${c.who.length ? `<ul class="reasons">${c.who.map(m => {
            const a = answerOf(m, x.i);
            const tag = [typeof a.from === 'number' && a.from !== a.i ? `đổi từ ${L(a.from)}${a.by?.n ? ` nhờ ${E(a.by.n)}` : ''}` : '', a.guess ? 'đoán' : ''].filter(Boolean);
            return `<li><b>${E(nm(m))}</b>${tag.map(t => ` <span class="mini">${t}</span>`).join('')} ${hasRich(whyOf(m, x.i)) ? `<span class="rich inl">${rich(whyOf(m, x.i), opt.images)}</span>` : ''}</li>`;
        }).join('')}</ul>` : ''}
        ${[...c.pro, ...c.con, ...c.other].length ? `<ul class="args">${[...c.pro, ...c.con, ...c.other].map(argLi).join('')}</ul>` : ''}
    </div>`).join('')}
    ${x.looseArgs.length ? `<ul class="args">${x.looseArgs.map(argLi).join('')}</ul>` : ''}
    ${x.changers.length ? `<p class="soft">🔄 Đổi ý sau khi bàn: ${x.changers.map(m => { const a = answerOf(m, x.i); return `${E(nm(m))} (${L(a.from)} → ${L(a.i)})`; }).join(', ')}</p>` : ''}</div>`);
    if (x.chats.length) out.push(`<div class="block"><h4>💬 Thảo luận · ${x.chats.length}</h4><div class="chat">${x.chats.map(m => `<div class="m">
        <p><b>${E(nm(m))}</b>${typeof m.ans === 'number' ? ` <span class="let sm">${L(m.ans)}</span>` : ''} <span class="soft">${hm(msTime(m) || Date.now())}</span></p>
        ${m.text ? `<p>${talk(m.text)}</p>` : ''}${imgsHtml(m.images, opt.images)}</div>`).join('')}</div></div>`);
    const notes = extraNotes(x, (l) => l.map(nm).join(', '));
    if (notes.length) out.push(`<p class="notes">${notes.map(E).join('<span class="dot">·</span>')}</p>`);
    return out.join('');
}

const PRINT_CSS = `
.diagram { margin: 8px 0; text-align: center; break-inside: avoid; }
.diagram svg { max-width: 100% !important; height: auto; }
.diagram-src { text-align: left; white-space: pre-wrap; font-size: 11px; background: #FFF6EA; border: 1px dashed #E8B27A; border-radius: 8px; padding: 8px; }
@page { size: A4; margin: 13mm 13mm 15mm;
    @bottom-left { content: "Zitthenkne · Biên bản buổi đánh đề"; font: 500 7.5pt 'Be Vietnam Pro', sans-serif; color: #a597b0; }
    @bottom-right { content: "Trang " counter(page) " / " counter(pages); font: 600 7.5pt 'Be Vietnam Pro', sans-serif; color: #a597b0; } }
:root { --ink:#2f2438; --muted:#85788f; --line:#efe6ee; --soft:#fbf8f9; --pink:#e5689a; --pink-soft:#ffeef4;
    --peach-soft:#fff3e8; --ok:#23906a; --ok-soft:#e6f7ef; --bad:#d23f45; --bad-soft:#fdeced; --warn:#a96d16; --warn-soft:#fff5e5; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { background: #f5eef2; }
body { margin: 0; font: 400 9.6pt/1.55 'Be Vietnam Pro', system-ui, sans-serif; color: var(--ink); }
a { color: #b0457a; text-decoration: none; }
.page { max-width: 188mm; margin: 14px auto 40px; padding: 12mm 12mm; background: #fff; border-radius: 10px; box-shadow: 0 16px 50px -26px rgba(60,30,70,.45); }
.bar-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; justify-content: space-between;
    padding: 10px 16px; background: rgba(255,255,255,.94); border-bottom: 1px solid var(--line); font-size: 10pt; }
.bar-top button { font: 700 10pt 'Be Vietnam Pro', sans-serif; color: #fff; border: 0; border-radius: 999px; padding: 9px 18px; cursor: pointer; background: #ff8fb8; }
.cover { padding: 0 0 10px; border-bottom: 2px solid var(--pink-soft); }
.cover-top { display: flex; align-items: center; gap: 7px; font-size: 7.8pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--pink); }
.cover-top img { width: 18px; height: 18px; border-radius: 5px; }
.cover-top em { margin-left: auto; font-style: normal; letter-spacing: 0; text-transform: none; color: var(--muted); font-weight: 700; }
.cover h1 { margin: 5px 0 3px; font-size: 17pt; line-height: 1.2; font-weight: 800; letter-spacing: -.01em; }
.cover .sub { margin: 0; color: var(--muted); font-weight: 500; }
.cover .sub2 { margin: 4px 0 0; font-size: 8.4pt; color: var(--muted); } .cover .sub2 b { color: var(--ink); font-weight: 700; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0 6px; }
.kpi { border-radius: 9px; padding: 6px 10px; background: var(--soft); border: 1px solid var(--line); }
.kpi b { display: block; font-size: 14pt; font-weight: 800; line-height: 1.15; }
.kpi b small { font-size: 8.5pt; color: var(--muted); font-weight: 600; }
.kpi span { font-size: 7.6pt; color: var(--muted); font-weight: 600; }
.kpi.ok b { color: var(--ok); } .kpi.warn b { color: var(--warn); } .kpi.bad b { color: var(--bad); }
.rank { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 6px 0 0; font-size: 8.6pt; }
.rk-l { font-size: 7.4pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-right: 2px; }
.rk { padding: 1px 8px; border-radius: 99px; background: var(--soft); border: 1px solid var(--line); }
.rk.top { background: #fff6d8; border-color: #f3dc8a; }
.sec { margin-top: 14px; }
h2 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; padding-bottom: 4px; font-size: 12pt; font-weight: 800; border-bottom: 2px solid var(--pink-soft); break-after: avoid; }
h2 small { font-size: 8.5pt; color: var(--muted); font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
.rich table { margin: 4px 0; border: 1px solid var(--line); }
.rich th, .rich td { border: 1px solid var(--line); padding: 3px 6px; text-align: left; vertical-align: top; }
.rich th { background: var(--pink-soft); }
.rich h4 { margin: 6px 0 2px; font-size: 10pt; }
th { text-align: left; font-size: 7.8pt; font-weight: 800; color: #8c4e6a; background: var(--pink-soft); padding: 5px 7px; }
td { padding: 5px 7px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }
.c { text-align: center; }
.soft, .muted { color: var(--muted); } .bad { color: var(--bad); }
.mini { display: inline-block; font-size: 7pt; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: var(--warn-soft); color: var(--warn); vertical-align: 1px; }
.mini.ok { background: var(--ok-soft); color: var(--ok); }
.cap { margin: 3px 0 0; font-size: 7.4pt; color: var(--muted); }
.qmap { display: grid; grid-template-columns: repeat(20, 1fr); gap: 3px; margin-top: 8px; }
.qc { display: block; text-align: center; font-size: 7.5pt; font-weight: 800; padding: 2px 0; border-radius: 5px; color: #fff; }
.qc.ok { background: #56c29a; } .qc.diff { background: #e6a646; } .qc.low { background: #e5696d; } .qc.open { background: #e6e0e4; color: #6d6275; } .qc.essay { background: var(--peach-soft); color: var(--warn); }
.todo { list-style: none; margin: 0; padding: 0; }
.todo li { position: relative; padding: 4px 6px 4px 24px; border-bottom: 1px dashed var(--line); break-inside: avoid; }
.todo .box { position: absolute; left: 6px; top: 7px; width: 10px; height: 10px; border: 1.5px solid #cdb9c8; border-radius: 3px; }
.todo .stemmini { color: var(--muted); } .todo .why { font-size: 8.2pt; color: var(--warn); font-weight: 600; }
.ok-line { color: var(--ok); font-weight: 700; }
.q { padding: 10px 0 8px; border-bottom: 1px solid var(--line); }
.q:last-child { border-bottom: 0; }
.q-head { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; break-after: avoid; }
.q-no { font-size: 11pt; font-weight: 800; margin-right: 2px; }
.meta { margin-left: auto; font-size: 7.6pt; color: var(--muted); }
.tag { display: inline-block; font-size: 7.4pt; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--soft); color: var(--muted); border: 1px solid var(--line); }
.tag.ok { background: var(--ok-soft); color: var(--ok); border-color: #bfe8d6; }
.tag.warn { background: var(--warn-soft); color: var(--warn); border-color: #f1d9ad; }
.tag.bad { background: var(--bad-soft); color: var(--bad); border-color: #f5c3c5; }
.case { margin: 6px 0; padding: 6px 10px; border-radius: 8px; background: var(--warn-soft); border-left: 3px solid #f0b66b; break-after: avoid; }
.stem { margin: 6px 0 5px; font-size: 10.2pt; font-weight: 600; break-after: avoid; }
.opts { list-style: none; margin: 0; padding: 0; break-inside: avoid; }
.opts li { display: flex; align-items: flex-start; gap: 7px; padding: 3px 6px; border-radius: 7px; }
.opts li.is-ok { background: var(--ok-soft); } .opts li.is-ok .otx > .rich { font-weight: 700; }
.let { flex: 0 0 auto; display: inline-grid; place-items: center; width: 17px; height: 17px; margin-top: 1px; border-radius: 99px; background: #f1ecef; color: #6f607a; font-size: 7.4pt; font-weight: 800; }
.let.sm { width: 14px; height: 14px; font-size: 6.6pt; vertical-align: 1px; }
.is-ok .let { background: var(--ok); color: #fff; } .is-ref .let { background: #f2c56f; color: #fff; }
.otx { flex: 1; min-width: 0; } .otx .rich p { margin: 0; }
.cnt { flex: 0 0 auto; font-size: 7.6pt; color: var(--muted); white-space: nowrap; padding-top: 1px; }
.oexp { margin-top: 1px; font-size: 8.3pt; color: var(--muted); font-weight: 400; }
.line { margin: 5px 0 0; font-size: 8.6pt; }
.block { margin-top: 6px; break-inside: avoid; }
.block h4, .call h4 { margin: 0 0 2px; font-size: 7.6pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #8c4e6a; }
.block h4 em { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--muted); }
.block.expl { padding: 6px 10px; border-radius: 8px; border-left: 3px solid var(--pink); background: #fffafc; }
.block.expl p { margin: 2px 0; }
.calls { display: grid; gap: 6px; margin-top: 6px; } .calls.n2 { grid-template-columns: 1fr 1fr; }
.call { padding: 6px 10px; border-radius: 8px; break-inside: avoid; } .call.peach { background: var(--peach-soft); } .call.pink { background: var(--pink-soft); }
.rich p { margin: 3px 0; } .rich ul, .rich ol { margin: 3px 0 3px 16px; padding: 0; } .rich img { max-width: 100%; max-height: 80mm; border-radius: 6px; border: 1px solid var(--line); margin: 3px 0; }
.rich mark { background: #fff1a3; padding: 0 2px; border-radius: 3px; } .rich code { background: var(--pink-soft); padding: 0 4px; border-radius: 4px; font-size: .92em; }
.rich.inl p { display: inline; margin: 0; }
.args { list-style: none; margin: 0; padding: 0; } .args li { padding: 1px 0; font-size: 8.8pt; }
.arg .aic { display: inline-block; width: 15px; font-weight: 800; } .arg.pro .aic { color: var(--ok); } .arg.con .aic { color: var(--bad); } .arg.ask .aic { color: var(--warn); }
.docref { margin: 2px 0; font-size: 8.8pt; } .docref p { margin: 0; }
.docref blockquote { margin: 2px 0 4px; padding: 1px 0 1px 9px; border-left: 3px solid #eed4df; color: #54485c; font-style: italic; }
.reasons { list-style: none; margin: 0; padding: 0; } .reasons li { padding: 2px 0; border-bottom: 1px dashed var(--line); }
.camp { margin: 4px 0; padding: 5px 9px; border-radius: 8px; background: var(--soft); border: 1px solid var(--line); break-inside: avoid; }
.camp.ok { background: var(--ok-soft); border-color: #bfe8d6; } .camp-h { margin: 0 0 2px; }
.chat .ql { display: block; margin: 2px 0; padding-left: 8px; border-left: 2px solid #eed4df; color: #5e5468; font-style: italic; }
.chat .m { padding: 3px 0 3px 9px; border-left: 2px solid #f1e0e8; margin: 3px 0; break-inside: avoid; } .chat .m p { margin: 1px 0; }
.imgs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; } .imgs img { max-width: 48%; max-height: 60mm; border-radius: 6px; border: 1px solid var(--line); object-fit: contain; }
.noimg { color: var(--muted); font-size: 8pt; }
.notes { margin: 6px 0 0; font-size: 8pt; color: var(--muted); } .notes .dot { margin: 0 6px; color: #d5c7dc; }
.refs { margin: 0; padding-left: 18px; } .refs li { margin: 3px 0; word-break: break-word; }
.endnote { margin: 14px 0 0; padding-top: 6px; border-top: 1px solid var(--line); text-align: center; font-size: 7.6pt; color: var(--muted); }
@media print {
    html { background: #fff; }
    .no-print { display: none !important; }
    .page { max-width: none; margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
    a { color: inherit; }
}
@media screen and (max-width: 700px) { .page { margin: 0; border-radius: 0; padding: 16px 14px; } .kpis { grid-template-columns: repeat(2, 1fr); } .qmap { grid-template-columns: repeat(10, 1fr); } .calls.n2 { grid-template-columns: 1fr; } .meta { margin-left: 0; width: 100%; } }
`;

// ================= 4. XUẤT =================
function fileName(d) {
    const slug = String(d.info.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'phong';
    const t = new Date();
    return `bien-ban-${slug}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
}

const readOpts = () => ({
    full: !!el('min-full')?.checked,          // mặc định GỌN
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

/** Trang in (PDF) không nạp Mermaid: vẽ sơ đồ NGAY ở trang phòng rồi nhúng SVG vào HTML in. */
async function inlineDiagrams(html) {
    if (!html.includes('mermaid-viewer')) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const v of doc.querySelectorAll('.mermaid-viewer[data-code]')) {
        let code = '';
        try { code = fixMermaidCode(decodeURIComponent(v.getAttribute('data-code'))); } catch (e) {}
        const box = v.closest('.mermaid-container') || v;
        const out = doc.createElement('div');
        out.className = 'diagram';
        try { out.innerHTML = code ? (await mermaidSvg(code)).svg : ''; }
        catch (e) { out.innerHTML = `<pre class="diagram-src">${E(code)}</pre>`; }
        box.replaceWith(out);
    }
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
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
            fillTab(tab, await inlineDiagrams(buildHtml(d)));
            if (kind === 'pdf') showToast('Bấm "In / Lưu PDF" ở đầu trang vừa mở.', 'info', 4000);
        } else {
            showToast('Đang mở hộp in — chọn "Lưu dưới dạng PDF".', 'info', 3000);
            await printViaFrame(await inlineDiagrams(buildHtml(d)), name);
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
