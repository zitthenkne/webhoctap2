/**
 * Hàm tiện ích dùng chung: chuẩn hóa document, định dạng phản hồi,
 * xử lý lỗi, và đóng gói kết quả tool theo CHARACTER_LIMIT.
 */

import { Timestamp } from "firebase-admin/firestore";
import type { DocumentData, QueryDocumentSnapshot, DocumentSnapshot } from "firebase-admin/firestore";
import { CHARACTER_LIMIT } from "../constants.js";
import type { QuizSet, QuizFolder, QuizResult, QuizQuestion } from "../types.js";

/** Định dạng chuẩn của một phản hồi tool MCP. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/** Chuyển giá trị thời gian của Firestore (Timestamp/Date/string) sang ISO string. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  // Firestore REST/raw có thể trả { seconds, nanoseconds }
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = (value as { seconds: number }).seconds;
    return new Date(seconds * 1000).toISOString();
  }
  if (typeof value === "string") return value;
  return null;
}

/** Chuẩn hóa một câu hỏi để output nhất quán. */
function normalizeQuestion(raw: DocumentData): QuizQuestion {
  return {
    question: raw.question ?? "",
    answers: raw.answers ?? raw.options ?? [],
    correctAnswerIndex:
      typeof raw.correctAnswerIndex === "number" ? raw.correctAnswerIndex : undefined,
    optionExplanations: raw.optionExplanations ?? undefined,
    explanation: raw.explanation ?? undefined,
    note: raw.note ?? undefined,
    expanded: raw.expanded ?? undefined,
    source: raw.source ?? undefined,
    caseId: raw.caseId ?? undefined,
    caseText: raw.caseText ?? undefined,
    caseTitle: raw.caseTitle ?? undefined,
  };
}

/** Chuyển snapshot Firestore thành QuizSet. includeQuestions=false để tiết kiệm context. */
export function toQuizSet(
  snap: DocumentSnapshot | QueryDocumentSnapshot | { id: string; data: () => DocumentData | undefined },
  includeQuestions = true,
): QuizSet {
  const data = snap.data() ?? {};
  const questions: QuizQuestion[] = Array.isArray(data.questions)
    ? data.questions.map(normalizeQuestion)
    : [];
  return {
    id: snap.id,
    userId: data.userId ?? "",
    title: data.title ?? "(không tiêu đề)",
    questionCount:
      typeof data.questionCount === "number" ? data.questionCount : questions.length,
    questions: includeQuestions ? questions : [],
    isPublic: data.isPublic ?? false,
    folderId: data.folderId ?? null,
    createdAt: toIso(data.createdAt),
  };
}

/** Chuyển snapshot Firestore thành QuizFolder. */
export function toQuizFolder(
  snap: DocumentSnapshot | QueryDocumentSnapshot | { id: string; data: () => DocumentData | undefined },
): QuizFolder {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    userId: data.userId ?? "",
    name: data.name ?? data.title ?? undefined,
    title: data.title ?? undefined,
    createdAt: toIso(data.createdAt),
  };
}

/** Chuyển snapshot Firestore thành QuizResult. */
export function toQuizResult(
  snap: DocumentSnapshot | QueryDocumentSnapshot | { id: string; data: () => DocumentData | undefined },
): QuizResult {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    userId: data.userId ?? "",
    quizId: data.quizId ?? "",
    quizTitle: data.quizTitle ?? "",
    score: typeof data.score === "number" ? data.score : 0,
    totalQuestions: typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
    percentage: typeof data.percentage === "number" ? data.percentage : 0,
    timeTaken: typeof data.timeTaken === "number" ? data.timeTaken : 0,
    completedAt: toIso(data.completedAt),
  };
}

/** Tạo phản hồi tool dạng văn bản thường. */
export function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

/**
 * Đóng gói dữ liệu có cấu trúc thành phản hồi tool.
 * Tự cắt bớt mảng `items` nếu vượt CHARACTER_LIMIT để không tràn context.
 */
export function jsonResult(
  output: Record<string, unknown>,
  itemsKey?: string,
): ToolResult {
  let text = JSON.stringify(output, null, 2);

  if (text.length > CHARACTER_LIMIT && itemsKey && Array.isArray(output[itemsKey])) {
    const items = output[itemsKey] as unknown[];
    const keep = Math.max(1, Math.floor(items.length / 2));
    const truncated = { ...output };
    truncated[itemsKey] = items.slice(0, keep);
    truncated.truncated = true;
    truncated.truncation_message =
      `Phản hồi đã bị cắt từ ${items.length} xuống ${keep} mục do vượt giới hạn ` +
      `${CHARACTER_LIMIT} ký tự. Dùng tham số 'offset'/'limit' hoặc thêm bộ lọc để xem thêm.`;
    text = JSON.stringify(truncated, null, 2);
    return { content: [{ type: "text", text }], structuredContent: truncated };
  }

  return { content: [{ type: "text", text }], structuredContent: output };
}

/** Chuyển lỗi bất kỳ thành thông điệp rõ ràng, có hướng xử lý. */
export function handleError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);

  // Lỗi quyền hạn Firestore.
  if (/permission|PERMISSION_DENIED|insufficient/i.test(message)) {
    return textResult(
      `Lỗi quyền truy cập Firestore: ${message}. ` +
        `Kiểm tra service account có vai trò 'Cloud Datastore User' hoặc 'Editor'.`,
      true,
    );
  }
  // Lỗi xác thực / thiếu khóa.
  if (/credential|service account|GOOGLE_APPLICATION/i.test(message)) {
    return textResult(`Lỗi cấu hình xác thực: ${message}`, true);
  }
  return textResult(`Lỗi: ${message}`, true);
}
