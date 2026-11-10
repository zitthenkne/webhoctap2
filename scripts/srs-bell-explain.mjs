// So lượt đọc của chuông ôn: quét cũ (mọi doc quiz_study của người dùng, kéo cả mảng srs) ↔ truy vấn tóm tắt (srsSum.next > 0).
// Dùng Query Explain (analyze: chạy thật, TÍNH PHÍ lượt đọc như truy vấn thường) — chạy trên STAGING, đừng chạy trên dự án thật.
//
//   node scripts/srs-bell-explain.mjs <service-account.json> <uid>
//
// In ra: số doc trả về, lượt đọc tính phí, byte trả về, chỉ mục đã dùng. Số ghi phát sinh của cách mới: mỗi lần đẩy lịch ôn ghi kèm srsSum
// trong CÙNG lệnh ghi (0 lượt ghi thêm); doc đời cũ được ghi bù srsSum một lần / bộ ở lần quét đầu tiên.
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const [, , keyPath, uid] = process.argv;
if (!keyPath || !uid) { console.error('Cách dùng: node scripts/srs-bell-explain.mjs <service-account.json> <uid>'); process.exit(1); }
const cred = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();
console.log('Dự án:', cred.project_id);

async function explain(label, q) {
    const r = await q.explain({ analyze: true });
    const s = r.metrics.executionStats;
    const plan = r.metrics.planSummary;
    const bytes = (r.snapshot ? r.snapshot.docs : []).reduce((n, d) => n + JSON.stringify(d.data()).length, 0);
    console.log(`\n${label}`);
    console.log('  doc trả về     :', s ? s.resultsReturned : '?');
    console.log('  lượt đọc tính phí:', s ? s.readOperations : '?');
    console.log('  byte (JSON)    :', bytes);
    console.log('  chỉ mục        :', JSON.stringify(plan && plan.indexesUsed));
}

const col = db.collection('quiz_study');
await explain('CŨ — quét mọi doc, lấy mảng srs', col.where('userId', '==', uid).select('quizId', 'srs', 'srsTitle', 'srsTotal', 'srsPaused', 'srsPausedAt'));
await explain('MỚI — chỉ bộ có lịch, lấy bản tóm tắt', col.where('userId', '==', uid).where('srsSum.next', '>', 0).select('quizId', 'srsSum', 'srsTitle', 'srsTotal', 'srsPaused', 'srsPausedAt'));
process.exit(0);
