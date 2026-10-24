/**
 * Các tool GHI (create/update/delete) cho Zitthenkne MCP server.
 * Yêu cầu service account có quyền ghi Firestore.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";
import { COLLECTIONS, ResponseFormat } from "../constants.js";
import { getFirestore } from "../services/firestore.js";
import { handleError, jsonResult, textResult, toQuizSet, type ToolResult } from "../services/helpers.js";
import {
  AddQuestionSchema,
  CreateQuizSetSchema,
  DeleteQuestionSchema,
  DeleteQuizSetSchema,
  UpdateQuestionSchema,
  UpdateQuizSetSchema,
  UpdateQuizSetObjectSchema,
} from "../schemas.js";

type QuestionInput = {
  type?: "mcq" | "essay";
  question: string;
  answers?: string[];
  correct_answer_index?: number;
  correct_answer_indexes?: number[];
  option_explanations?: string[];
  explanation?: string;
  note?: string;
  expanded?: string;
  source?: string;
  reasoning?: { cues: { text: string; kind?: string; hint?: string; in?: string }[]; steps: { from: (number | string)[]; text: string; out?: string; kind?: string }[]; goal: string };
  case_id?: string;
  case_text?: string;
  case_title?: string;
  case_reveal?: string;
  model_answer?: string;
  key_points?: (KeyPointInput | { group: string; max_points?: number; items: KeyPointInput[] })[];
  max_score?: number;
  answer_format?: { kind: string; count?: number; labels?: (string | { label?: string; hint?: string; size?: string; unit?: string })[]; columns?: string[]; rows?: number | string[]; placeholder?: string };
};
type KeyPointInput = { text: string; points?: number; keywords?: string[]; partial_points?: number; critical?: boolean; field?: number; order?: string[]; why?: string; example?: string };

/** Ý barem snake_case -> dạng lưu (camelCase, bỏ trường rỗng) */
function toStoredKeyPoint(k: KeyPointInput): Record<string, unknown> {
  const out: Record<string, unknown> = { text: k.text, points: k.points ?? 1 };
  if (k.keywords?.length) out.keywords = k.keywords;
  if (k.partial_points) out.partial = k.partial_points;
  if (k.critical) out.critical = true;
  if (k.field) out.field = k.field;
  if (k.order?.length) out.order = k.order;
  if (k.why) out.why = k.why;
  if (k.example) out.example = k.example;
  return out;
}

/** Chuyển câu hỏi từ định dạng input (snake_case) sang định dạng lưu Firestore (giống web app). */
function toStoredQuestion(q: QuestionInput): Record<string, unknown> {
  // Tự luận: answers rỗng + type 'essay' (web app nhận diện câu không phương án là tự luận)
  const stored: Record<string, unknown> =
    q.type === "essay"
      ? { question: q.question, type: "essay", answers: [] }
      : { question: q.question, answers: q.answers, correctAnswerIndex: q.correct_answer_index };
  if (q.model_answer) stored.modelAnswer = q.model_answer;
  if (q.key_points?.length)
    stored.keyPoints = q.key_points.map((k) =>
      "items" in k
        ? { group: k.group, ...(k.max_points ? { max: k.max_points } : {}), items: k.items.map(toStoredKeyPoint) }
        : toStoredKeyPoint(k),
    );
  if (q.max_score) stored.maxScore = q.max_score;
  if (q.answer_format && q.answer_format.kind !== "text") stored.answerFormat = q.answer_format;
  if (q.case_reveal) stored.caseReveal = q.case_reveal;
  if (q.correct_answer_indexes && q.correct_answer_indexes.length > 0) {
    stored.correctAnswerIndexes = q.correct_answer_indexes;
  }
  if (q.option_explanations) stored.optionExplanations = q.option_explanations;
  if (q.explanation) stored.explanation = q.explanation;
  if (q.note) stored.note = q.note;
  if (q.expanded) stored.expanded = q.expanded;
  if (q.source) stored.source = q.source;
  if (q.reasoning) stored.reasoning = q.reasoning;
  if (q.case_id) stored.caseId = q.case_id;
  if (q.case_text) stored.caseText = q.case_text;
  if (q.case_title) stored.caseTitle = q.case_title;
  return stored;
}

const ESSAY_GUIDE = `    Tự luận / thi tình huống: { type: 'essay', question, model_answer?, key_points?, max_score?, explanation?, note, expanded } — KHÔNG truyền answers/correct_answer_index.
      - key_points = BAREM. Máy tự dò từ khóa trong bài làm để tick sẵn, người làm xem lại và tick thêm. Mỗi ý:
          { text, points (mặc định 1), keywords: [2-6 từ khóa/đồng nghĩa/viết tắt, có dấu, ngắn], partial_points?, critical?, why, example? }
        LUÔN kèm keywords cho mọi ý (thiếu keywords máy chỉ đoán theo chữ của text, kém chính xác hơn).
        Ý NGUYÊN TỬ: mỗi ý ≤ 25 từ, MỘT khái niệm — một từ khóa khớp là máy tick cả ý, nên ý gộp "A + B + C" bị tick oan khi bài chỉ có A.
        CHECKLIST LÀ ĐÁP ÁN (bản 2): mỗi ý đủ 3 lớp, đọc liền các ý = một bài đạt điểm tối đa:
          · text = ý chấm · why = 1 câu ≤ 30 từ "vì sao có điểm / thiếu thì sao" (mọi ý điểm dương)
          · example = VIẾT MẪU ≤ 40 từ, đúng câu chữ nên ghi / nói với người bệnh (liều + đường dùng, cách ghi chẩn đoán,
            câu tư vấn) — bắt buộc khi cách diễn đạt được chấm (tư vấn, kê đơn, ghi chẩn đoán), bỏ khi ý tự nó đã là câu viết mẫu.
          Web: mặc định hiện why + example dưới ý người làm THIẾU; nút "Xem đáp án đầy đủ" hiện cho mọi ý.
        Các kiểu barem (chỉ dùng khi barem gốc có, đừng tự bịa):
          · ý một phần: partial_points (vd. points 0.5, partial_points 0.25 khi có tên thuốc mà thiếu liều)
          · ý bắt buộc / điểm liệt: critical: true -> thiếu thì cả câu 0 điểm
          · lỗi trừ điểm: points âm (vd. { text: 'Dùng nitrat khi tụt HA', points: -0.5, keywords: ['nitrat'] }) — máy KHÔNG tự tick, chỉ nhắc
          · thứ tự bước (trạm khám / thủ thuật, "sai thứ tự 0 điểm"): { text: 'Đúng thứ tự: A → B → C', critical: true, order: ['A|viết tắt A', 'B', 'C'] }
          · nhóm "nêu k trong n": { group: 'Nêu 2 trong 4 nguyên nhân', max_points: 1, items: [{ text, points: 0.5, keywords }, …] }
      - answer_format = KIỂU Ô TRẢ LỜI — chọn theo cách đề hỏi (đọc kỹ câu hỏi, đừng mặc định ô dài):
          · "Nêu / Kể N …" (N cụ thể: 3 chẩn đoán phân biệt, 4 nhóm thuốc…) -> { kind: 'list', count: N }. Barem có N ý
            (đáp án đúng nhiều hơn N thì dùng nhóm "nêu N trong M" với max_points = điểm N ý). Không cần field (thứ tự tự do).
          · Một câu hỏi GỒM NHIỀU PHẦN riêng (Chẩn đoán sơ bộ + phân biệt; Chẩn đoán + hướng xử trí; phân loại theo EF / NYHA / giai đoạn)
            -> { kind: 'fields', labels: [tên từng phần] } và GẮN field (số ô, từ 1) cho mọi ý để máy không tính nhầm ý viết sai ô.
          · Kê đơn / so sánh / điền bảng (thuốc – liều – đường dùng; so sánh A với B theo tiêu chí) -> { kind: 'table', columns: [...], rows: số hàng
            hoặc [nhãn hàng] }. Có nhãn hàng thì field = số hàng của ý.
          · Trả lời bằng MỘT cụm ngắn (chẩn đoán xác định, tên bệnh, một con số, một thuốc) -> { kind: 'short' }.
          · Giải thích cơ chế, biện luận, trình bày, phân tích -> bỏ trống (ô văn bản dài).
          · Nhãn ô / nhãn hàng / placeholder KHÔNG được lộ đáp án (đề hỏi kể thuốc thì đừng đặt nhãn hàng "Aspirin").
          · MỖI Ô ĐẶT TỰ DO (list / fields): phần tử labels là chuỗi nhãn, hoặc { label, hint, size, unit }:
              hint = chữ mờ hướng dẫn cách ghi ('kèm mức độ', 'ghi theo thứ tự ưu tiên') · size: line (1 dòng) | para (đoạn) | long (dài)
              unit = đơn vị sau ô cho câu điền số ('lần/phút', 'mmHg', 'cm', 'tuần'). Ví dụ trạm OSCE đọc sinh hiệu:
              { kind: 'fields', labels: [{ label: 'Mạch', unit: 'lần/phút', size: 'line' }, { label: 'Huyết áp', unit: 'mmHg', size: 'line' },
                { label: 'Nhận định', hint: 'bình thường / bất thường + lý do', size: 'para' }] }
              Chọn cỡ theo độ dài câu trả lời mong đợi; nhiều phần khác loại trong một câu thì dùng fields với từng ô riêng.
      - PHIẾU CHẤM (web bản 2): mỗi nội dung hiện MỘT chỗ — viết mỗi trường đúng vai, KHÔNG lặp ý giữa các trường:
          · explanation = dải CHỐT trên đầu phiếu: 1 câu ≤ 40 từ, kết luận cốt lõi. Không ghi lại "Chốt" trong note.
          · key_points = cột "Barem cần có" đặt cạnh bài làm TỪNG Ô (gắn field), mỗi ý text + why + example như trên.
          · model_answer = KHÔNG viết khi checklist đã đủ (nó chỉ lặp lại barem). CHỈ viết khi có thứ checklist không chở được:
            hình đáp án (vẽ/chấm lên biểu đồ, CTG, sản đồ), bảng/đơn thuốc trình bày liền, kịch bản tư vấn liền mạch (role-play dài).
            Khi viết với fields/list: chia ĐÚNG số mục bằng số ô, mỗi mục mở bằng dòng riêng "1. **Tên mục:**" — web đặt dưới bài làm
            từng ô (gập sẵn, "Đáp án tham khảo"); lệch số mục thì hiện liền một khối "cả bài".
          · note (tab Ghi nhớ): mỗi dòng "emoji Nhãn: nội dung" thành một thẻ — ⚠️ Bẫy trạm / điểm liệt, 💡 Lời dặn giảng viên,
            🧠 Mẹo nhớ, 🔢 Mốc số. Ngắn, ≤ 5 dòng.
          · expanded: kiến thức VƯỢT đáp án, chia khúc bằng dòng tiêu đề RIÊNG một dòng: "⚙️ **Tinh hoa 80/20 & Cơ chế lõi:**" →
            "⚠️ **Radar cạm bẫy:**" → "🔀 **What-if:**" (bảng so sánh, phân loại, mốc số, xử trí tiếp theo). Web đặt ⚙️/🔀 ở tab Mở rộng,
            khúc ⚠️ dời sang tab Ghi nhớ cạnh note — nên KHÔNG ghi cùng một bẫy ở cả note lẫn Radar. Tối thiểu ~200 ký tự.
      - MỌI câu tự luận BẮT BUỘC có note + expanded (thiếu là bị từ chối), nên có explanation (dải Chốt).
      - max_score = điểm tối đa của CÂU trong đề (trọng số; vd. đề thang 10: câu 1 = 2đ, câu 2 = 3đ). Tổng barem của câu nên bằng max_score.
      - Cần ít nhất một trong key_points / model_answer. Không có key_points thì mỗi gạch đầu dòng cấp 1 của model_answer thành 1 ý (ghi điểm cuối ý: "- Killip I (0.5đ)").
      - Đề tình huống: bối cảnh chung đặt ở case_text (lặp y hệt ở mọi câu cùng case_id), mỗi câu hỏi nhỏ là một câu riêng theo đúng thứ tự.
      - HÌNH VẼ BẰNG MÃ (mọi trường markdown, cả trắc nghiệm): khối \`\`\`mermaid (flowchart lưu đồ / xychart-beta biểu đồ đường-cột / pie)
        hoặc khối \`\`\`svg (hình y khoa vẽ tay: băng CTG, biểu đồ chuyển dạ, đường cong tăng trưởng). SVG phải tự đủ: viewBox + width + height,
        <title>, font-family có sans-serif, KHÔNG script / on…= / href ngoài / foreignObject, ≤ 200 KB (web hiện SVG dưới dạng ảnh).
        Đề nhớ lại MẤT HÌNH mà còn lời tả -> tái tạo hình từ đúng lời tả (không bịa số làm đổi đáp án) và ghi note "🖌 Hình tái tạo: …".
      - expanded nên có HÌNH khi hình dạy được điều chữ khó tả (thao tác khám, kiểu hình CTG/ECG/X-quang, giải phẫu): ưu tiên ảnh giấy phép mở
        trên Wikimedia Commons — ![mô tả tiếng Việt](https://upload.wikimedia.org/…) + dòng ngay dưới *Hình: tác giả · giấy phép · [Wikimedia Commons](link)*
        (CC BY / BY-SA bắt buộc ghi công); không có ảnh vừa ý thì VẼ (mermaid / svg). Tối đa 1–2 hình mỗi câu. Ảnh chỉ dùng https.
      - case_reveal (tùy chọn) ở câu k = thông tin mới (vd. kết quả xét nghiệm) chỉ lộ ra từ câu k; xem câu k rồi thì các câu trước của ca bị khóa, không sửa được nữa.
      - Trộn trắc nghiệm + tự luận trong cùng bộ đề được.
      Ví dụ: { type: 'essay', case_id: 'ca1', case_title: 'Đau ngực', case_text: 'BN nam 58t...', question: 'Chẩn đoán sơ bộ?', max_score: 1.5,
                key_points: [{ text: 'NMCT cấp ST chênh lên', critical: true, keywords: ['nhồi máu cơ tim', 'NMCT', 'STEMI'] }, { text: 'Thành dưới', points: 0.5, keywords: ['thành dưới'] }] },
              { type: 'essay', case_id: 'ca1', case_title: 'Đau ngực', case_text: 'BN nam 58t...', case_reveal: 'Troponin hs 850 ng/L', question: 'Xử trí ban đầu?', model_answer: '- Aspirin 300mg nhai\\n- Chụp mạch vành cấp cứu' }`;

/** Trả về phản hồi thành công nhất quán cho cả markdown lẫn json. */
function ok(
  format: ResponseFormat,
  payload: Record<string, unknown>,
  message: string,
): ToolResult {
  if (format === ResponseFormat.JSON) return jsonResult({ success: true, ...payload });
  return textResult(message);
}

export function registerWriteTools(server: McpServer): void {
  /* ---------------- quiz_create_set ---------------- */
  server.registerTool(
    "quiz_create_set",
    {
      title: "Tạo bộ đề mới",
      description: `Tạo một bộ đề trắc nghiệm mới trong quiz_sets. Tự tính questionCount và đặt createdAt = thời điểm server.

Args:
  - title (string, bắt buộc)
  - user_id (string, bắt buộc): UID chủ sở hữu
  - questions (array, >=1): mỗi câu gồm { question, answers[>=2], correct_answer_index, correct_answer_indexes?(câu nhiều đáp án, ≥2), option_explanations?, explanation? }
    Ca lâm sàng (case chùm): để nhiều câu dùng chung một tình huống, đặt cùng case_id cho các câu đó và truyền case_text (nội dung ca) + case_title (tùy chọn) giống nhau ở các câu cùng nhóm. Các câu cùng case_id sẽ được nhóm liền nhau khi làm bài.
${ESSAY_GUIDE}
  - is_public (boolean, mặc định true)
  - folder_id (string | null, mặc định null)
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, title, questionCount }`,
      inputSchema: CreateQuizSetSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof CreateQuizSetSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const questions = params.questions.map(toStoredQuestion);
        const ref = await db.collection(COLLECTIONS.QUIZ_SETS).add({
          userId: params.user_id,
          title: params.title,
          questionCount: questions.length,
          questions,
          isPublic: params.is_public,
          folderId: params.folder_id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return ok(
          params.response_format,
          { id: ref.id, title: params.title, questionCount: questions.length },
          `Đã tạo bộ đề "${params.title}" (${questions.length} câu). ID: ${ref.id}`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_update_set ---------------- */
  server.registerTool(
    "quiz_update_set",
    {
      title: "Cập nhật thông tin bộ đề",
      description: `Cập nhật metadata của bộ đề (không đụng vào câu hỏi). Cần ít nhất một trường.

Args:
  - quiz_id (string, bắt buộc)
  - title (string, optional)
  - is_public (boolean, optional)
  - folder_id (string | null, optional)
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, updated: [tên các trường đã đổi] }
Lỗi: "Không tìm thấy bộ đề" nếu quiz_id sai.`,
      inputSchema: UpdateQuizSetObjectSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof UpdateQuizSetSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const update: Record<string, unknown> = {};
        if (params.title !== undefined) update.title = params.title;
        if (params.is_public !== undefined) update.isPublic = params.is_public;
        if (params.folder_id !== undefined) update.folderId = params.folder_id;

        await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
        return ok(
          params.response_format,
          { id: params.quiz_id, updated: Object.keys(update) },
          `Đã cập nhật bộ đề ${params.quiz_id}: ${Object.keys(update).join(", ")}.`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_add_question ---------------- */
  server.registerTool(
    "quiz_add_question",
    {
      title: "Thêm câu hỏi vào bộ đề",
      description: `Thêm một câu hỏi vào cuối mảng questions của bộ đề và tăng questionCount.

Args:
  - quiz_id (string, bắt buộc)
  - question (object): { question, answers[>=2], correct_answer_index, correct_answer_indexes?(câu nhiều đáp án, ≥2), option_explanations?, explanation? }
    hoặc câu tự luận { type: 'essay', question, model_answer?, key_points?, case_* ... } — xem hướng dẫn tự luận ở quiz_create_set.
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, questionCount }`,
      inputSchema: AddQuestionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof AddQuestionSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const data = doc.data() ?? {};
        const questions = Array.isArray(data.questions) ? [...data.questions] : [];
        questions.push(toStoredQuestion(params.question as QuestionInput));
        await ref.update({ questions, questionCount: questions.length, updatedAt: FieldValue.serverTimestamp() });

        return ok(
          params.response_format,
          { id: params.quiz_id, questionCount: questions.length },
          `Đã thêm câu hỏi. Tổng cộng ${questions.length} câu.`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_update_question ---------------- */
  server.registerTool(
    "quiz_update_question",
    {
      title: "Sửa một câu hỏi",
      description: `Thay thế câu hỏi tại vị trí question_index bằng nội dung mới.

Args:
  - quiz_id (string, bắt buộc)
  - question_index (number >=0): vị trí 0-based trong mảng questions
  - question (object): nội dung thay thế
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, question_index }
Lỗi: trả lỗi nếu quiz_id sai hoặc question_index vượt quá số câu hiện có.`,
      inputSchema: UpdateQuestionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof UpdateQuestionSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const data = doc.data() ?? {};
        const questions = Array.isArray(data.questions) ? [...data.questions] : [];
        if (params.question_index >= questions.length) {
          return textResult(
            `question_index ${params.question_index} vượt quá số câu hiện có (${questions.length}).`,
            true,
          );
        }
        questions[params.question_index] = toStoredQuestion(params.question as QuestionInput);
        await ref.update({ questions, updatedAt: FieldValue.serverTimestamp() });

        return ok(
          params.response_format,
          { id: params.quiz_id, question_index: params.question_index },
          `Đã sửa câu hỏi #${params.question_index} của bộ đề ${params.quiz_id}.`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_delete_question ---------------- */
  server.registerTool(
    "quiz_delete_question",
    {
      title: "Xóa một câu hỏi",
      description: `Xóa câu hỏi tại vị trí question_index và giảm questionCount.

Args:
  - quiz_id (string, bắt buộc)
  - question_index (number >=0): vị trí 0-based
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, questionCount }`,
      inputSchema: DeleteQuestionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof DeleteQuestionSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const data = doc.data() ?? {};
        const questions = Array.isArray(data.questions) ? [...data.questions] : [];
        if (params.question_index >= questions.length) {
          return textResult(
            `question_index ${params.question_index} vượt quá số câu hiện có (${questions.length}).`,
            true,
          );
        }
        questions.splice(params.question_index, 1);
        await ref.update({ questions, questionCount: questions.length, updatedAt: FieldValue.serverTimestamp() });

        return ok(
          params.response_format,
          { id: params.quiz_id, questionCount: questions.length },
          `Đã xóa câu hỏi #${params.question_index}. Còn lại ${questions.length} câu.`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_delete_set ---------------- */
  server.registerTool(
    "quiz_delete_set",
    {
      title: "Xóa bộ đề",
      description: `Xóa vĩnh viễn một bộ đề. Bắt buộc confirm=true để tránh xóa nhầm.

Args:
  - quiz_id (string, bắt buộc)
  - confirm (boolean, bắt buộc): phải là true mới thực thi

Returns (JSON): { success: true, id, deletedTitle }
Lưu ý: thao tác KHÔNG thể hoàn tác.`,
      inputSchema: DeleteQuizSetSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof DeleteQuizSetSchema>): Promise<ToolResult> => {
      try {
        if (!params.confirm) {
          return textResult("Chưa xóa: cần đặt confirm=true để xác nhận xóa vĩnh viễn.", true);
        }
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const title = toQuizSet(doc, false).title;
        await ref.delete();
        if (params.response_format === ResponseFormat.JSON) {
          return jsonResult({ success: true, id: params.quiz_id, deletedTitle: title });
        }
        return textResult(`Đã xóa vĩnh viễn bộ đề "${title}" (${params.quiz_id}).`);
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
