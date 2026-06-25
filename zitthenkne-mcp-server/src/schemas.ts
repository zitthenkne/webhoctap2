/**
 * Các Zod schema dùng để validate input cho tất cả tool.
 */

import { z } from "zod";
import { ResponseFormat } from "./constants.js";

const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Định dạng output: 'markdown' (dễ đọc) hoặc 'json' (cho xử lý máy)");

const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Số kết quả tối đa trả về (1-100)");

const offset = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe("Số kết quả bỏ qua để phân trang");

/* ----------------------------- READ ----------------------------- */

export const ListQuizSetsSchema = z
  .object({
    user_id: z.string().optional().describe("Lọc theo UID người tạo (tùy chọn)"),
    folder_id: z
      .string()
      .optional()
      .describe("Lọc theo ID thư mục. Truyền 'root' để lấy bộ đề không thuộc thư mục nào"),
    public_only: z
      .boolean()
      .default(false)
      .describe("Nếu true, chỉ lấy bộ đề công khai (isPublic=true)"),
    limit,
    offset,
    response_format: responseFormat,
  })
  .strict();

export const SearchQuizSetsSchema = z
  .object({
    query: z
      .string()
      .min(1, "Từ khóa không được rỗng")
      .max(200)
      .describe("Từ khóa tìm trong tiêu đề bộ đề (không phân biệt hoa thường)"),
    user_id: z.string().optional().describe("Giới hạn trong bộ đề của một UID (tùy chọn)"),
    limit,
    response_format: responseFormat,
  })
  .strict();

export const GetQuizSetSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID document của bộ đề trong collection quiz_sets"),
    include_answers: z
      .boolean()
      .default(true)
      .describe("Có kèm đáp án đúng và giải thích hay không"),
    response_format: responseFormat,
  })
  .strict();

export const ListFoldersSchema = z
  .object({
    user_id: z.string().optional().describe("Lọc theo UID chủ sở hữu (tùy chọn)"),
    limit,
    response_format: responseFormat,
  })
  .strict();

export const ListResultsSchema = z
  .object({
    user_id: z.string().optional().describe("Lọc theo UID người làm bài (tùy chọn)"),
    quiz_id: z.string().optional().describe("Lọc theo ID bộ đề (tùy chọn)"),
    limit,
    offset,
    response_format: responseFormat,
  })
  .strict();

export const UserStatsSchema = z
  .object({
    user_id: z.string().min(1).describe("UID người dùng cần tính thống kê"),
    response_format: responseFormat,
  })
  .strict();

/* ----------------------------- WRITE ----------------------------- */

const QuestionInputSchema = z
  .object({
    question: z.string().min(1, "Nội dung câu hỏi không được rỗng").describe("Nội dung câu hỏi"),
    answers: z
      .array(z.string().min(1))
      .min(2, "Cần ít nhất 2 đáp án")
      .max(10)
      .describe("Danh sách đáp án (2-10)"),
    correct_answer_index: z
      .number()
      .int()
      .min(0)
      .describe("Chỉ số (0-based) của đáp án đúng trong mảng answers"),
    option_explanations: z
      .array(z.string())
      .optional()
      .describe("Giải thích cho từng đáp án, cùng thứ tự với answers (tùy chọn)"),
    explanation: z.string().optional().describe("Giải thích chung cho câu hỏi (tùy chọn)"),
    note: z.string().optional().describe("Ghi chú học tập/lâm sàng (tùy chọn)"),
    expanded: z.string().optional().describe("Kiến thức mở rộng giảng giải (tùy chọn)"),
    source: z.string().optional().describe("Nguồn tài liệu tham khảo đối chiếu (tùy chọn)"),
    case_id: z
      .string()
      .optional()
      .describe("Mã ca lâm sàng. Các câu cùng case_id dùng chung một tình huống lâm sàng và được nhóm liền nhau khi làm bài (tùy chọn)"),
    case_text: z
      .string()
      .optional()
      .describe("Nội dung tình huống/ca lâm sàng dùng chung (markdown). Nên đặt giống nhau ở mọi câu cùng case_id (tùy chọn)"),
    case_title: z
      .string()
      .optional()
      .describe("Tiêu đề ngắn của ca lâm sàng, hiển thị trên đầu khung ca (tùy chọn)"),
  })
  .strict()
  .refine((q) => q.correct_answer_index < q.answers.length, {
    message: "correct_answer_index phải nhỏ hơn số lượng đáp án",
    path: ["correct_answer_index"],
  });

export const CreateQuizSetSchema = z
  .object({
    title: z.string().min(1, "Tiêu đề không được rỗng").max(300).describe("Tiêu đề bộ đề"),
    user_id: z.string().min(1).describe("UID chủ sở hữu bộ đề (Firebase Auth)"),
    questions: z
      .array(QuestionInputSchema)
      .min(1, "Cần ít nhất 1 câu hỏi")
      .describe("Danh sách câu hỏi của bộ đề"),
    is_public: z.boolean().default(true).describe("Bộ đề có công khai hay không"),
    folder_id: z.string().nullable().default(null).describe("ID thư mục chứa bộ đề, hoặc null"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateQuizSetObjectSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề cần cập nhật"),
    title: z.string().min(1).max(300).optional().describe("Tiêu đề mới (tùy chọn)"),
    is_public: z.boolean().optional().describe("Trạng thái công khai mới (tùy chọn)"),
    folder_id: z
      .string()
      .nullable()
      .optional()
      .describe("ID thư mục mới, hoặc null để chuyển về gốc (tùy chọn)"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateQuizSetSchema = UpdateQuizSetObjectSchema.refine(
  (d) => d.title !== undefined || d.is_public !== undefined || d.folder_id !== undefined,
  { message: "Cần cung cấp ít nhất một trường để cập nhật (title/is_public/folder_id)" },
);

export const AddQuestionSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề cần thêm câu hỏi"),
    question: QuestionInputSchema.describe("Câu hỏi mới"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateQuestionSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề"),
    question_index: z
      .number()
      .int()
      .min(0)
      .describe("Chỉ số (0-based) của câu hỏi cần sửa trong mảng questions"),
    question: QuestionInputSchema.describe("Nội dung câu hỏi thay thế"),
    response_format: responseFormat,
  })
  .strict();

export const DeleteQuestionSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề"),
    question_index: z
      .number()
      .int()
      .min(0)
      .describe("Chỉ số (0-based) của câu hỏi cần xóa"),
    response_format: responseFormat,
  })
  .strict();

export const DeleteQuizSetSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề cần xóa"),
    confirm: z
      .boolean()
      .describe("Bắt buộc đặt true để xác nhận xóa vĩnh viễn (đề phòng xóa nhầm)"),
    response_format: responseFormat,
  })
  .strict();

export const CreateFolderSchema = z
  .object({
    name: z.string().min(1, "Tên thư mục không được rỗng").max(200).describe("Tên thư mục"),
    user_id: z.string().min(1).describe("UID chủ sở hữu thư mục"),
    response_format: responseFormat,
  })
  .strict();

export const MoveToFolderSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề cần di chuyển"),
    folder_id: z
      .string()
      .nullable()
      .describe("ID thư mục đích, hoặc null để chuyển về thư mục gốc"),
    response_format: responseFormat,
  })
  .strict();
