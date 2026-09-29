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

const KeyPointItemSchema = z
  .object({
    text: z.string().min(1).describe("Một ý chấm — ngắn gọn, một khái niệm chấm được"),
    points: z
      .number()
      .refine((v) => v !== 0, "points khác 0")
      .optional()
      .describe("Điểm của ý (mặc định 1). SỐ ÂM = LỖI TRỪ ĐIỂM (vd. -0.5 cho 'dùng nitrat khi tụt HA'): người làm tick nếu mắc"),
    keywords: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Từ khóa để MÁY TỰ NHẬN DIỆN ý trong bài làm: tên thuốc, thuật ngữ, từ đồng nghĩa, viết tắt (vd. ['aspirin','asa','acetylsalicylic']). Khớp NGUYÊN CỤM bất kỳ từ khóa nào là máy tick sẵn; nên viết có dấu, ngắn (1-3 chữ), 2-6 từ khóa/ý. Bài gõ không dấu và viết tắt y khoa thông dụng (NMCT, THA, ĐTĐ...) đã được tự xử lý",
      ),
    partial_points: z
      .number()
      .positive()
      .optional()
      .describe("Điểm khi nêu CHƯA ĐỦ (vd. có tên thuốc nhưng thiếu liều), phải nhỏ hơn points"),
    critical: z
      .boolean()
      .optional()
      .describe("Ý BẮT BUỘC (điểm liệt): thiếu ý này thì cả câu 0 điểm. Chỉ dùng khi barem gốc ghi rõ"),
    field: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Ô chứa ý này (đếm từ 1) khi answer_format là 'fields' / 'list' / 'table' (bảng: số HÀNG). Máy chỉ dò ý trong đúng ô đó — vd. 'NMCT' ghi ở ô Chẩn đoán phân biệt sẽ không được tính cho ý Chẩn đoán chính. Bỏ trống = dò cả bài",
      ),
    order: z
      .array(z.string().min(1))
      .min(2)
      .optional()
      .describe(
        "Ý KIỂM TRA THỨ TỰ (trạm thủ thuật / quy trình): các bước theo đúng trình tự, mỗi bước là cụm từ khóa, cách viết tương đương ngăn bằng '|' (vd. ['bề cao tử cung|BCTC','Leopold','tim thai','cơn gò|cơn co','khám trong']). Máy chỉ tick khi mọi bước có mặt và xuất hiện đúng thứ tự",
      ),
  })
  .strict();

const AnswerFormatSchema = z
  .object({
    kind: z
      .enum(["text", "short", "list", "fields", "table"])
      .describe("text = ô văn bản dài (mặc định) · short = 1 dòng · list = N ô đánh số · fields = các ô có nhãn · table = bảng cột × hàng"),
    count: z.number().int().min(1).max(12).optional().describe("list: số ô (= số ý đề yêu cầu nêu)"),
    labels: z.array(z.string().min(1)).max(12).optional().describe("fields: nhãn từng ô (bắt buộc) · list: nhãn gợi ý từng ô (tùy chọn)"),
    columns: z.array(z.string().min(1)).min(1).max(6).optional().describe("table: tên các cột (bắt buộc)"),
    rows: z
      .union([z.number().int().min(1).max(12), z.array(z.string().min(1)).min(1).max(12)])
      .optional()
      .describe("table: số hàng, hoặc nhãn từng hàng (vd. các tiêu chí so sánh)"),
    placeholder: z.string().optional().describe("Chữ mờ gợi ý trong ô (tùy chọn)"),
  })
  .strict();

const KeyPointGroupSchema = z
  .object({
    group: z.string().min(1).describe("Tên nhóm hiển thị, vd. 'Nêu 3 trong 5 nguyên nhân'"),
    max_points: z.number().positive().optional().describe("Điểm tối đa của cả nhóm (trần); mặc định = tổng điểm các ý"),
    items: z.array(KeyPointItemSchema).min(2).describe("Các ý trong nhóm (điểm dương, không dùng critical)"),
  })
  .strict();

const QuestionInputSchema = z
  .object({
    type: z
      .enum(["mcq", "essay"])
      .default("mcq")
      .describe("'mcq' = trắc nghiệm (mặc định) · 'essay' = tự luận: KHÔNG có answers/correct_answer_index, dùng model_answer + key_points"),
    question: z.string().min(1, "Nội dung câu hỏi không được rỗng").describe("Nội dung câu hỏi (markdown)"),
    answers: z
      .array(z.string().min(1))
      .min(2, "Cần ít nhất 2 đáp án")
      .max(10)
      .optional()
      .describe("Trắc nghiệm: danh sách đáp án (2-10). Tự luận: bỏ trống"),
    correct_answer_index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Trắc nghiệm: chỉ số (0-based) của đáp án đúng (câu nhiều đáp án: để index đúng ĐẦU TIÊN). Tự luận: bỏ trống"),
    correct_answer_indexes: z
      .array(z.number().int().min(0))
      .min(2)
      .optional()
      .describe("Câu NHIỀU đáp án đúng: mảng chỉ số (0-based) tất cả đáp án đúng (≥2). Câu 1 đáp án thì BỎ trường này."),
    option_explanations: z
      .array(z.string())
      .optional()
      .describe("Giải thích cho từng đáp án, cùng thứ tự với answers (tùy chọn)"),
    explanation: z.string().optional().describe("Giải thích chung cho câu hỏi (tùy chọn)"),
    note: z.string().optional().describe("Thẻ 'Ghi nhớ' (markdown): mẹo nhớ, lưu ý, bẫy hay nhầm — hiện sau khi mở đáp án. BẮT BUỘC với câu tự luận, tùy chọn với trắc nghiệm"),
    expanded: z.string().optional().describe("Thẻ 'Mở rộng kiến thức' (markdown): kiến thức VƯỢT đáp án mẫu — bảng so sánh, phân loại, cơ chế, mốc số, hướng xử trí; không chép lại đáp án. BẮT BUỘC với câu tự luận, tùy chọn với trắc nghiệm"),
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
    case_reveal: z
      .string()
      .optional()
      .describe(
        "Ca MỞ DẦN: thông tin bổ sung (markdown, vd. kết quả cận lâm sàng) chỉ hiện trong khung ca TỪ câu này trở đi. Khi người làm đã xem câu này, các câu TRƯỚC của ca bị khóa. Dùng được cho cả trắc nghiệm lẫn tự luận (tùy chọn)",
      ),
    model_answer: z
      .string()
      .optional()
      .describe(
        "Tự luận: đáp án mẫu (markdown). Nếu không truyền key_points, mỗi gạch đầu dòng CẤP 1 ('- ý (1đ)') được tách thành một ý chấm",
      ),
    key_points: z
      .array(z.union([KeyPointItemSchema, KeyPointGroupSchema]))
      .optional()
      .describe(
        "Tự luận: BAREM. Mỗi phần tử là một ý {text, points, keywords, partial_points?, critical?} hoặc một nhóm 'nêu k trong n' {group, max_points, items}. Điểm câu = điểm ý đạt / tổng điểm tối đa (nhóm tính tối đa max_points; lỗi trừ điểm không cộng vào tổng)",
      ),
    answer_format: AnswerFormatSchema.optional().describe(
      "Tự luận: kiểu ô trả lời, chọn THEO CÁCH ĐỀ HỎI (xem hướng dẫn trong quiz_create_set). Bỏ trống = ô văn bản dài",
    ),
    max_score: z
      .number()
      .positive()
      .optional()
      .describe("Điểm tối đa của CÂU trong cả bài (trọng số, mặc định 1) — vd. đề 10 điểm: câu 1 = 2, câu 2 = 3... Dùng được cho cả trắc nghiệm"),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.type === "essay") {
      if (q.answers?.length) ctx.addIssue({ code: "custom", path: ["answers"], message: "Câu tự luận không có answers" });
      if (!q.model_answer && !q.key_points?.length)
        ctx.addIssue({ code: "custom", path: ["model_answer"], message: "Câu tự luận cần model_answer hoặc key_points" });
      if (!q.note?.trim())
        ctx.addIssue({ code: "custom", path: ["note"], message: "Câu tự luận BẮT BUỘC có note (bẫy, mẹo nhớ, lỗi hay gặp)" });
      if (!q.expanded?.trim())
        ctx.addIssue({ code: "custom", path: ["expanded"], message: "Câu tự luận BẮT BUỘC có expanded (kiến thức vượt đáp án mẫu: bảng so sánh, phân loại, cơ chế, mốc số)" });
      let positive = 0;
      (q.key_points ?? []).forEach((kp, i) => {
        const items = "items" in kp ? kp.items : [kp];
        items.forEach((it, j) => {
          const path = ["key_points", i, ...("items" in kp ? ["items", j] : [])];
          const pts = it.points ?? 1;
          if (pts > 0) positive++;
          if ("items" in kp && (pts < 0 || it.critical))
            ctx.addIssue({ code: "custom", path, message: "Ý trong nhóm phải có điểm dương và không đặt critical" });
          if (it.partial_points !== undefined && (pts < 0 || it.partial_points >= pts))
            ctx.addIssue({ code: "custom", path, message: "partial_points phải nhỏ hơn points (và ý không phải lỗi trừ điểm)" });
          if (it.critical && pts < 0) ctx.addIssue({ code: "custom", path, message: "Lỗi trừ điểm không thể là ý bắt buộc" });
        });
        if ("items" in kp && kp.max_points !== undefined) {
          const sum = kp.items.reduce((a, it) => a + (it.points ?? 1), 0);
          if (kp.max_points > sum)
            ctx.addIssue({ code: "custom", path: ["key_points", i, "max_points"], message: "max_points của nhóm không được lớn hơn tổng điểm các ý" });
        }
      });
      if (q.key_points?.length && !positive)
        ctx.addIssue({ code: "custom", path: ["key_points"], message: "Barem cần ít nhất một ý có điểm dương" });
      const f = q.answer_format;
      let slots = 0;
      if (f) {
        const rowCount = Array.isArray(f.rows) ? f.rows.length : f.rows ?? 3;
        if (f.kind === "fields" && !f.labels?.length)
          ctx.addIssue({ code: "custom", path: ["answer_format", "labels"], message: "answer_format 'fields' cần labels" });
        if (f.kind === "table" && !f.columns?.length)
          ctx.addIssue({ code: "custom", path: ["answer_format", "columns"], message: "answer_format 'table' cần columns" });
        if (f.kind === "list" && f.count && f.labels?.length && f.labels.length !== f.count)
          ctx.addIssue({ code: "custom", path: ["answer_format", "labels"], message: "list: số labels phải bằng count" });
        slots = f.kind === "fields" ? f.labels?.length ?? 0 : f.kind === "list" ? f.count ?? f.labels?.length ?? 3 : f.kind === "table" ? rowCount : 0;
      }
      (q.key_points ?? []).forEach((kp, i) => {
        const items = "items" in kp ? kp.items : [kp];
        items.forEach((it, j) => {
          if (it.field === undefined) return;
          if (!slots || it.field > slots)
            ctx.addIssue({
              code: "custom",
              path: ["key_points", i, ...("items" in kp ? ["items", j] : []), "field"],
              message: slots ? `field vượt số ô (${slots})` : "field chỉ dùng khi answer_format là fields / list / table",
            });
        });
      });
      return;
    }
    if (!q.answers || q.answers.length < 2) {
      ctx.addIssue({ code: "custom", path: ["answers"], message: "Câu trắc nghiệm cần ít nhất 2 đáp án (hoặc đặt type: 'essay')" });
      return;
    }
    const n = q.answers.length;
    if (q.correct_answer_index === undefined || q.correct_answer_index >= n)
      ctx.addIssue({ code: "custom", path: ["correct_answer_index"], message: "correct_answer_index bắt buộc và phải nhỏ hơn số lượng đáp án" });
    if (q.correct_answer_indexes && !q.correct_answer_indexes.every((i) => i < n))
      ctx.addIssue({ code: "custom", path: ["correct_answer_indexes"], message: "correct_answer_indexes có index vượt số lượng đáp án" });
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

/* ------------------------ BỆNH ÁN (medical_records) ------------------------ */

const recordFields = z
  .record(z.string(), z.unknown())
  .describe(
    "Map 'đường dẫn có dấu chấm' -> giá trị, ví dụ { \"hanhChinh.hoTen\": \"Nguyễn Văn A\", " +
      "\"chanDoanSoBo\": \"Viêm phổi\" }. Chỉ các đường dẫn được truyền mới bị ghi đè.",
  );

export const ListRecordsSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án (Firebase Auth)"),
    folder_id: z
      .string()
      .optional()
      .describe("Lọc theo đợt thực hành (record.thuMuc.id). Truyền 'root' để lấy bệnh án ngoài thư mục"),
    limit,
    offset,
    response_format: responseFormat,
  })
  .strict();

export const SearchRecordsSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án"),
    query: z
      .string()
      .min(1, "Từ khóa không được rỗng")
      .max(200)
      .describe("Từ khóa tìm trong họ tên, lý do vào viện, chẩn đoán (không phân biệt hoa thường/dấu)"),
    limit,
    response_format: responseFormat,
  })
  .strict();

export const GetRecordSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án"),
    record_id: z.string().min(1).describe("ID bệnh án (dạng 'BA-1712345678901')"),
    paths: z
      .array(z.string())
      .optional()
      .describe("Chỉ lấy các đường dẫn này (vd ['hanhChinh.hoTen','benhSu']). Bỏ trống = lấy toàn bộ"),
    response_format: responseFormat,
  })
  .strict();

export const CreateRecordSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án"),
    record_id: z
      .string()
      .optional()
      .describe("ID muốn đặt. Bỏ trống sẽ tự sinh dạng 'BA-<timestamp>' giống web app"),
    fields: recordFields.optional(),
    response_format: responseFormat,
  })
  .strict();

export const UpdateRecordSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án"),
    record_id: z.string().min(1).describe("ID bệnh án cần sửa"),
    fields: recordFields,
    response_format: responseFormat,
  })
  .strict();

export const DeleteRecordSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu bệnh án"),
    record_id: z.string().min(1).describe("ID bệnh án cần xóa"),
    confirm: z.boolean().describe("Phải là true mới thực sự xóa"),
  })
  .strict();
