/**
 * Các tool ĐỌC (read-only) cho Zitthenkne MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Query } from "firebase-admin/firestore";
import type { z } from "zod";
import { COLLECTIONS, ResponseFormat } from "../constants.js";
import { getFirestore } from "../services/firestore.js";
import {
  handleError,
  jsonResult,
  textResult,
  toQuizSet,
  toQuizFolder,
  toQuizResult,
  type ToolResult,
} from "../services/helpers.js";
import {
  GetQuizSetSchema,
  ListFoldersSchema,
  ListQuizSetsSchema,
  ListResultsSchema,
  SearchQuizSetsSchema,
  UserStatsSchema,
} from "../schemas.js";
import type { QuizSet, UserStats } from "../types.js";

/** Tóm tắt một bộ đề (không kèm câu hỏi) thành dòng markdown. */
function quizSummaryLine(q: QuizSet): string {
  const pub = q.isPublic ? "công khai" : "riêng tư";
  const folder = q.folderId ? ` · thư mục ${q.folderId}` : "";
  return `- **${q.title}** (\`${q.id}\`) — ${q.questionCount} câu · ${pub}${folder}`;
}

export function registerReadTools(server: McpServer): void {
  /* ---------------- quiz_list_sets ---------------- */
  server.registerTool(
    "quiz_list_sets",
    {
      title: "Liệt kê bộ đề",
      description: `Liệt kê các bộ đề trắc nghiệm trong collection quiz_sets, có phân trang và bộ lọc.

Args:
  - user_id (string, optional): chỉ lấy bộ đề của UID này
  - folder_id (string, optional): lọc theo thư mục; truyền "root" để lấy bộ đề không thuộc thư mục
  - public_only (boolean): nếu true chỉ lấy isPublic=true (mặc định false)
  - limit (number 1-100, mặc định 20), offset (number, mặc định 0)
  - response_format ('markdown' | 'json')

Returns (JSON): { total, count, offset, has_more, next_offset?, items: [{ id, userId, title, questionCount, isPublic, folderId, createdAt }] }
Lưu ý: không kèm nội dung câu hỏi (dùng quiz_get_set để xem chi tiết).`,
      inputSchema: ListQuizSetsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof ListQuizSetsSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        let query = db.collection(COLLECTIONS.QUIZ_SETS) as Query;
        if (params.user_id) query = query.where("userId", "==", params.user_id);
        if (params.public_only) query = query.where("isPublic", "==", true);
        if (params.folder_id) {
          query = query.where("folderId", "==", params.folder_id === "root" ? null : params.folder_id);
        }

        const snap = await query.get();
        const all = snap.docs.map((d) => toQuizSet(d, false));
        const total = all.length;
        const page = all.slice(params.offset, params.offset + params.limit);
        const hasMore = total > params.offset + page.length;

        const output = {
          total,
          count: page.length,
          offset: params.offset,
          has_more: hasMore,
          ...(hasMore ? { next_offset: params.offset + page.length } : {}),
          items: page,
        };

        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");

        if (page.length === 0) return textResult("Không tìm thấy bộ đề nào khớp bộ lọc.");
        const lines = [`# Bộ đề (${total} tổng, hiển thị ${page.length})`, "", ...page.map(quizSummaryLine)];
        if (hasMore) lines.push("", `_Còn nữa — dùng offset=${params.offset + page.length}_`);
        return textResult(lines.join("\n"));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_search_sets ---------------- */
  server.registerTool(
    "quiz_search_sets",
    {
      title: "Tìm bộ đề theo tiêu đề",
      description: `Tìm bộ đề có tiêu đề chứa từ khóa (không phân biệt hoa thường). Khớp ở phía client sau khi tải dữ liệu.

Args:
  - query (string, bắt buộc): từ khóa tìm trong tiêu đề
  - user_id (string, optional): giới hạn trong bộ đề của một UID
  - limit (number 1-100, mặc định 20)
  - response_format ('markdown' | 'json')

Returns (JSON): { query, count, items: [{ id, title, questionCount, isPublic, userId, folderId, createdAt }] }`,
      inputSchema: SearchQuizSetsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof SearchQuizSetsSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        let query = db.collection(COLLECTIONS.QUIZ_SETS) as Query;
        if (params.user_id) query = query.where("userId", "==", params.user_id);

        const snap = await query.get();
        const needle = params.query.toLowerCase();
        const matches = snap.docs
          .map((d) => toQuizSet(d, false))
          .filter((q) => q.title.toLowerCase().includes(needle))
          .slice(0, params.limit);

        const output = { query: params.query, count: matches.length, items: matches };

        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
        if (matches.length === 0) return textResult(`Không có bộ đề nào khớp "${params.query}".`);
        return textResult(
          [`# Kết quả tìm "${params.query}" (${matches.length})`, "", ...matches.map(quizSummaryLine)].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_get_set ---------------- */
  server.registerTool(
    "quiz_get_set",
    {
      title: "Xem chi tiết bộ đề",
      description: `Lấy đầy đủ một bộ đề kèm toàn bộ câu hỏi.

Args:
  - quiz_id (string, bắt buộc): ID document trong quiz_sets
  - include_answers (boolean, mặc định true): có kèm đáp án đúng + giải thích không
  - response_format ('markdown' | 'json')

Returns (JSON): { id, userId, title, questionCount, isPublic, folderId, createdAt, questions: [{ question, answers[], correctAnswerIndex?, optionExplanations?, explanation? }] }
Lỗi: trả "Không tìm thấy bộ đề" nếu quiz_id không tồn tại.`,
      inputSchema: GetQuizSetSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof GetQuizSetSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const doc = await db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id).get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        const quiz = toQuizSet(doc, true);
        const questions = quiz.questions.map((q) => {
          if (params.include_answers) return q;
          const { correctAnswerIndex, optionExplanations, explanation, ...rest } = q;
          return rest;
        });
        const output = { ...quiz, questions };

        if (params.response_format === ResponseFormat.JSON) return jsonResult(output);

        const lines = [
          `# ${quiz.title}`,
          "",
          `ID: \`${quiz.id}\` · ${quiz.questionCount} câu · ${quiz.isPublic ? "công khai" : "riêng tư"}`,
          "",
        ];
        quiz.questions.forEach((q, i) => {
          lines.push(`## Câu ${i + 1}. ${q.question}`);
          (q.answers ?? []).forEach((a, idx) => {
            const mark = params.include_answers && idx === q.correctAnswerIndex ? " ✅" : "";
            lines.push(`${String.fromCharCode(65 + idx)}. ${a}${mark}`);
          });
          if (params.include_answers && q.explanation) lines.push(`> ${q.explanation}`);
          lines.push("");
        });
        return textResult(lines.join("\n"));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_list_folders ---------------- */
  server.registerTool(
    "quiz_list_folders",
    {
      title: "Liệt kê thư mục",
      description: `Liệt kê thư mục (quiz_folders) dùng để tổ chức bộ đề.

Args:
  - user_id (string, optional): lọc theo UID chủ sở hữu
  - limit (number 1-100, mặc định 20)
  - response_format ('markdown' | 'json')

Returns (JSON): { count, items: [{ id, userId, name, createdAt }] }`,
      inputSchema: ListFoldersSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof ListFoldersSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        let query = db.collection(COLLECTIONS.QUIZ_FOLDERS) as Query;
        if (params.user_id) query = query.where("userId", "==", params.user_id);
        const snap = await query.get();
        const items = snap.docs.map(toQuizFolder).slice(0, params.limit);
        const output = { count: items.length, items };

        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
        if (items.length === 0) return textResult("Không có thư mục nào.");
        return textResult(
          [`# Thư mục (${items.length})`, "", ...items.map((f) => `- **${f.name ?? "(không tên)"}** (\`${f.id}\`)`)].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_list_results ---------------- */
  server.registerTool(
    "quiz_list_results",
    {
      title: "Liệt kê kết quả làm bài",
      description: `Liệt kê kết quả làm bài (quiz_results), có phân trang và bộ lọc.

Args:
  - user_id (string, optional): lọc theo người làm bài
  - quiz_id (string, optional): lọc theo bộ đề
  - limit (1-100, mặc định 20), offset (mặc định 0)
  - response_format ('markdown' | 'json')

Returns (JSON): { total, count, offset, has_more, next_offset?, items: [{ id, userId, quizId, quizTitle, score, totalQuestions, percentage, timeTaken, completedAt }] }`,
      inputSchema: ListResultsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof ListResultsSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        let query = db.collection(COLLECTIONS.QUIZ_RESULTS) as Query;
        if (params.user_id) query = query.where("userId", "==", params.user_id);
        if (params.quiz_id) query = query.where("quizId", "==", params.quiz_id);

        const snap = await query.get();
        const all = snap.docs
          .map(toQuizResult)
          .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        const total = all.length;
        const page = all.slice(params.offset, params.offset + params.limit);
        const hasMore = total > params.offset + page.length;

        const output = {
          total,
          count: page.length,
          offset: params.offset,
          has_more: hasMore,
          ...(hasMore ? { next_offset: params.offset + page.length } : {}),
          items: page,
        };

        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
        if (page.length === 0) return textResult("Không có kết quả nào khớp bộ lọc.");
        const lines = [
          `# Kết quả làm bài (${total} tổng, hiển thị ${page.length})`,
          "",
          ...page.map(
            (r) =>
              `- **${r.quizTitle}** — ${r.score}/${r.totalQuestions} (${r.percentage}%) · ${r.timeTaken}s · ${r.completedAt ?? "?"}`,
          ),
        ];
        return textResult(lines.join("\n"));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_get_user_stats ---------------- */
  server.registerTool(
    "quiz_get_user_stats",
    {
      title: "Thống kê người dùng",
      description: `Tổng hợp thống kê làm bài của một người dùng từ quiz_results, cộng số bộ đề đã tạo từ collection users.

Args:
  - user_id (string, bắt buộc)
  - response_format ('markdown' | 'json')

Returns (JSON): { userId, totalAttempts, averagePercentage, bestPercentage, totalQuestionsAnswered, perfectScores, quizSetsCreated }`,
      inputSchema: UserStatsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof UserStatsSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const resultsSnap = await db
          .collection(COLLECTIONS.QUIZ_RESULTS)
          .where("userId", "==", params.user_id)
          .get();
        const results = resultsSnap.docs.map(toQuizResult);

        const totalAttempts = results.length;
        const avg =
          totalAttempts > 0
            ? results.reduce((s, r) => s + r.percentage, 0) / totalAttempts
            : 0;
        const best = results.reduce((m, r) => Math.max(m, r.percentage), 0);
        const totalQ = results.reduce((s, r) => s + r.totalQuestions, 0);
        const perfect = results.filter((r) => r.percentage === 100).length;

        let quizSetsCreated = 0;
        const userDoc = await db.collection(COLLECTIONS.USERS).doc(params.user_id).get();
        if (userDoc.exists) quizSetsCreated = userDoc.data()?.quizSetsCreated ?? 0;

        const output: UserStats = {
          userId: params.user_id,
          totalAttempts,
          averagePercentage: Math.round(avg * 10) / 10,
          bestPercentage: best,
          totalQuestionsAnswered: totalQ,
          perfectScores: perfect,
          quizSetsCreated,
        };

        if (params.response_format === ResponseFormat.JSON) {
          return jsonResult(output as unknown as Record<string, unknown>);
        }
        return textResult(
          [
            `# Thống kê người dùng \`${params.user_id}\``,
            "",
            `- Lượt làm bài: ${totalAttempts}`,
            `- Điểm trung bình: ${output.averagePercentage}%`,
            `- Điểm cao nhất: ${best}%`,
            `- Tổng câu đã làm: ${totalQ}`,
            `- Số lần đạt 100%: ${perfect}`,
            `- Số bộ đề đã tạo: ${quizSetsCreated}`,
          ].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
