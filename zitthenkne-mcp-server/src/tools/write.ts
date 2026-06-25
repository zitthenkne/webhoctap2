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
  CreateFolderSchema,
  CreateQuizSetSchema,
  DeleteQuestionSchema,
  DeleteQuizSetSchema,
  MoveToFolderSchema,
  UpdateQuestionSchema,
  UpdateQuizSetSchema,
  UpdateQuizSetObjectSchema,
} from "../schemas.js";

type QuestionInput = {
  question: string;
  answers: string[];
  correct_answer_index: number;
  option_explanations?: string[];
  explanation?: string;
  note?: string;
  expanded?: string;
  source?: string;
  case_id?: string;
  case_text?: string;
  case_title?: string;
};

/** Chuyển câu hỏi từ định dạng input (snake_case) sang định dạng lưu Firestore (giống web app). */
function toStoredQuestion(q: QuestionInput): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    question: q.question,
    answers: q.answers,
    correctAnswerIndex: q.correct_answer_index,
  };
  if (q.option_explanations) stored.optionExplanations = q.option_explanations;
  if (q.explanation) stored.explanation = q.explanation;
  if (q.note) stored.note = q.note;
  if (q.expanded) stored.expanded = q.expanded;
  if (q.source) stored.source = q.source;
  if (q.case_id) stored.caseId = q.case_id;
  if (q.case_text) stored.caseText = q.case_text;
  if (q.case_title) stored.caseTitle = q.case_title;
  return stored;
}

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
  - questions (array, >=1): mỗi câu gồm { question, answers[>=2], correct_answer_index, option_explanations?, explanation? }
    Ca lâm sàng (case chùm): để nhiều câu dùng chung một tình huống, đặt cùng case_id cho các câu đó và truyền case_text (nội dung ca) + case_title (tùy chọn) giống nhau ở các câu cùng nhóm. Các câu cùng case_id sẽ được nhóm liền nhau khi làm bài.
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

        await ref.update(update);
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
  - question (object): { question, answers[>=2], correct_answer_index, option_explanations?, explanation? }
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
        await ref.update({ questions, questionCount: questions.length });

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
        await ref.update({ questions });

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
        await ref.update({ questions, questionCount: questions.length });

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

  /* ---------------- quiz_create_folder ---------------- */
  server.registerTool(
    "quiz_create_folder",
    {
      title: "Tạo thư mục",
      description: `Tạo thư mục mới trong quiz_folders để tổ chức bộ đề.

Args:
  - name (string, bắt buộc)
  - user_id (string, bắt buộc): UID chủ sở hữu
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, name }`,
      inputSchema: CreateFolderSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof CreateFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = await db.collection(COLLECTIONS.QUIZ_FOLDERS).add({
          name: params.name,
          userId: params.user_id,
          createdAt: FieldValue.serverTimestamp(),
        });
        return ok(
          params.response_format,
          { id: ref.id, name: params.name },
          `Đã tạo thư mục "${params.name}". ID: ${ref.id}`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_move_to_folder ---------------- */
  server.registerTool(
    "quiz_move_to_folder",
    {
      title: "Di chuyển bộ đề vào thư mục",
      description: `Đặt folderId của một bộ đề. Truyền folder_id=null để chuyển về thư mục gốc.

Args:
  - quiz_id (string, bắt buộc)
  - folder_id (string | null, bắt buộc)
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, folderId }`,
      inputSchema: MoveToFolderSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof MoveToFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        await ref.update({ folderId: params.folder_id });
        const dest = params.folder_id ? `thư mục ${params.folder_id}` : "thư mục gốc";
        return ok(
          params.response_format,
          { id: params.quiz_id, folderId: params.folder_id },
          `Đã chuyển bộ đề ${params.quiz_id} về ${dest}.`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
