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
    include_subfolders: z
      .boolean()
      .default(false)
      .describe("Khi có folder_id: lấy cả bộ đề trong mọi thư mục con cháu (cần biết chủ sở hữu thư mục)"),
    include_deleted: z
      .boolean()
      .default(false)
      .describe("Có lấy cả bộ đề đang nằm trong thùng rác hay không (mặc định không)"),
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

const folderIcon = z
  .string()
  .regex(/^fa-[a-z0-9-]+$/, "Icon phải có dạng 'fa-xxx', vd 'fa-heart-pulse'")
  .describe("Icon FontAwesome 6 (solid) dạng 'fa-xxx', vd 'fa-folder', 'fa-heart-pulse', 'fa-brain'");

const folderColor = z
  .string()
  .regex(
    /^(amber|pink|red|green|blue|indigo|purple|#[0-9a-fA-F]{6})$/,
    "Màu phải là amber/pink/red/green/blue/indigo/purple hoặc mã '#RRGGBB'",
  )
  .describe("Màu thư mục: amber | pink | red | green | blue | indigo | purple | '#RRGGBB'");

export const ListFoldersSchema = z
  .object({
    user_id: z.string().optional().describe("Lọc theo UID chủ sở hữu (nên truyền để có đường dẫn & số liệu cây)"),
    parent_id: z
      .string()
      .optional()
      .describe("Chỉ lấy thư mục con TRỰC TIẾP của thư mục này. Truyền 'root' để lấy thư mục cấp gốc. Cần user_id"),
    include_deleted: z.boolean().default(false).describe("Có lấy thư mục trong thùng rác hay không"),
    limit,
    response_format: responseFormat,
  })
  .strict();

export const FolderTreeSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu thư viện"),
    root_id: z
      .string()
      .optional()
      .describe("Chỉ vẽ nhánh bắt đầu từ thư mục này (bỏ trống = toàn bộ thư viện)"),
    max_depth: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Số cấp tối đa trả về tính từ điểm bắt đầu (số liệu vẫn gộp cả cây con)"),
    include_quizzes: z
      .boolean()
      .default(false)
      .describe("Liệt kê luôn bộ đề nằm trong từng thư mục (và ở gốc)"),
    response_format: responseFormat,
  })
  .strict();

export const GetFolderSchema = z
  .object({
    folder_id: z.string().min(1).describe("ID thư mục trong quiz_folders"),
    include_subfolders: z
      .boolean()
      .default(false)
      .describe("Liệt kê bộ đề của cả cây con (mặc định chỉ bộ đề nằm trực tiếp trong thư mục)"),
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
    text: z.string().min(1).describe("Một ý chấm NGUYÊN TỬ — ngắn (≤ 15 từ), MỘT khái niệm chấm được, lời giải thích để ở `why`. Máy chấm: ý ≤ 8 tiếng có nghĩa thì một từ khóa là đạt; ý dài hơn phải khớp thêm nội dung. Ý LIỆT KÊ viết đúng khuôn 'Tên: a, b, c' (vd. 'Đau bụng: vị trí, tính chất, thời gian') — phải nêu ≥ ½ vế mới đạt, thiếu thì máy chỉ 'gần khớp' và liệt kê vế thiếu. Con số kèm đơn vị trong text (300 mg, ≥ 3.5 mm) là bắt buộc để đạt đủ. Ngoặc = tên khác / ví dụ của vế chứa nó"),
    points: z
      .number()
      .refine((v) => v !== 0, "points khác 0")
      .optional()
      .describe("Điểm của ý (mặc định 1). SỐ ÂM = LỖI TRỪ ĐIỂM (vd. -0.5 cho 'dùng nitrat khi tụt HA'): người làm tick nếu mắc"),
    keywords: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Từ khóa để MÁY TỰ NHẬN DIỆN ý: tên thuốc, thuật ngữ, từ ĐỒNG NGHĨA người làm hay viết, viết tắt (vd. ['aspirin','asa']). Khớp nguyên cụm; có dấu, ngắn (1-3 chữ), 2-6 từ khóa/ý. KHÔNG dùng chữ đã có sẵn trong đề / case_text (máy coi là chép đề, không tính) — từ khóa phải là thứ người làm TỰ VIẾT ra (kết luận, diễn giải, hành động). Ý phủ định ('Không đình chỉ thai') thì từ khóa mang luôn chữ phủ định ('không đình chỉ'): máy hiểu không/chưa/tránh/cấm/chống chỉ định đứng ngay trước chữ khớp. Đồng nghĩa KHÔNG có trong text (vd. 'mong con' cho vế 'thai kỳ có kế hoạch') được tính bù một vế. Bài gõ không dấu và viết tắt y khoa thông dụng đã được tự xử lý",
      ),
    partial_points: z
      .number()
      .positive()
      .optional()
      .describe("Điểm khi nêu CHƯA ĐỦ (vd. có tên thuốc nhưng thiếu liều), phải nhỏ hơn points. Máy TỰ cho mức này khi bài mới nêu một phần vế / thiếu con số của ý — nên đặt cho ý liệt kê và ý có liều / ngưỡng"),
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
        "Ô chứa ý này (đếm từ 1) khi answer_format là 'fields' / 'list' / 'table' (bảng: số HÀNG). Máy chỉ chấm ý trong đúng ô đó — vd. 'NMCT' ghi ở ô Chẩn đoán phân biệt không được tính cho ý Chẩn đoán chính (chỉ hiện gợi ý 'ghi ở ô khác'). Bỏ trống = dò cả bài",
      ),
    order: z
      .array(z.string().min(1))
      .min(2)
      .optional()
      .describe(
        "Ý KIỂM TRA THỨ TỰ (trạm thủ thuật / quy trình): các bước theo đúng trình tự, mỗi bước là cụm từ khóa, cách viết tương đương ngăn bằng '|' (vd. ['bề cao tử cung|BCTC','Leopold','tim thai','cơn gò|cơn co','khám trong']). Máy chỉ tick khi mọi bước có mặt và xuất hiện đúng thứ tự",
      ),
    why: z
      .string()
      .min(1)
      .optional()
      .describe(
        "MỘT câu ≤ 30 từ: vì sao ý này có điểm / thiếu thì hậu quả gì (vd. 'Không hạ áp thì nguy cơ xuất huyết não ở mẹ'). Phiếu chấm hiện ngay dưới ý khi người làm THIẾU ý đó — nên có cho ý bắt buộc và ý hay sót; không chép lại text",
      ),
    example: z
      .string()
      .min(1)
      .optional()
      .describe(
        "VIẾT MẪU ≤ 40 từ: đúng câu chữ nên ghi trong bài thi / nói với người bệnh cho ý này (vd. 'Labetalol 20 mg tiêm tĩnh mạch chậm, nhắc lại sau 10 phút, mục tiêu HA < 160/110 mmHg'). Checklist có text + why + example thay cho model_answer viết liền",
      ),
  })
  .strict();

// Một ô tự đặt (list / fields): chuỗi = nhãn, hoặc object đặt tự do từng ô
const AnswerSlotSchema = z.union([
  z.string().min(1),
  z
    .object({
      label: z.string().optional().describe("Nhãn hiện trên ô (vd. 'Mạch', 'Chẩn đoán sơ bộ') — KHÔNG lộ đáp án"),
      hint: z.string().optional().describe("Chữ mờ gợi ý trong ô (vd. 'kèm mức độ', 'ghi số + đơn vị')"),
      size: z.enum(["line", "para", "long"]).optional().describe("line = 1 dòng (Enter sang ô kế) · para = đoạn · long = ô dài; mặc định list = line, fields = para"),
      unit: z.string().optional().describe("Đơn vị hiện sau ô (vd. 'lần/phút', 'mmHg', 'cm', 'tuần')"),
    })
    .strict()
    .refine((o) => !!(o.label || o.hint || o.unit), { message: "Ô cần ít nhất label, hint hoặc unit" }),
]);

const AnswerFormatSchema = z
  .object({
    kind: z
      .enum(["text", "short", "list", "fields", "table"])
      .describe("text = ô văn bản dài (mặc định) · short = 1 dòng · list = N ô đánh số · fields = các ô có nhãn · table = bảng cột × hàng"),
    count: z.number().int().min(1).max(12).optional().describe("list: số ô (= số ý đề yêu cầu nêu)"),
    labels: z
      .array(AnswerSlotSchema)
      .max(20)
      .optional()
      .describe("fields: các ô (bắt buộc) · list: từng ô (tùy chọn). Mỗi ô là chuỗi nhãn hoặc { label, hint, size, unit } đặt tự do"),
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

// Thẻ "Quét dữ kiện & hướng tư duy" (web features/quiz/page/quiz-reasoning.js): bấm ra đáp án thì tô từng cues[].text
// ngay trong đề + vẽ dữ kiện ➜ chuỗi suy luận ➜ chốt. Chữ cái ở in/out là thứ tự GỐC của answers (web tự đổi khi xáo).
const ReasoningSchema = z
  .object({
    cues: z
      .array(
        z
          .object({
            text: z.string().min(1).describe("Cụm dữ kiện CHÉP NGUYÊN VĂN từ question / case_text / đáp án (không **, không $) — web tô ngay trong đề"),
            kind: z.enum(["key", "neg", "trap"]).optional().describe("key = bản lề (mặc định) · neg = âm tính có giá trị · trap = mồi nhử"),
            hint: z.string().optional().describe("Thấy cụm này thì nghĩ tới gì (≤ 16 từ)"),
            in: z.string().optional().describe("Chỉ tìm trong: 'case' | 'q' | chữ cái đáp án gốc"),
          })
          .strict(),
      )
      .min(1),
    steps: z
      .array(
        z
          .object({
            from: z
              .array(z.union([z.number().int().min(1), z.string().regex(/^b?\d+$/)]))
              .min(1)
              .describe("Số = dữ kiện (1-based) · 'b1' = kết luận bước 1 (chỉ trỏ lùi)"),
            text: z.string().min(1).describe("Kết luận của bước (≤ 25 từ, chỉ **đậm**)"),
            out: z.string().regex(/^[A-Ha-h ,]+$/).optional().describe("Chữ cái đáp án GỐC bị gạch ở bước này — KHÔNG gạch đáp án đúng"),
            kind: z.enum(["then", "join", "out"]).optional().describe("Bỏ trống = web tự suy; tự luận loại trừ chẩn đoán ghi 'out'"),
          })
          .strict(),
      )
      .min(1),
    goal: z.string().min(1).describe("Dòng Chốt (≤ 20 từ)"),
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
    explanation: z.string().optional().describe("Giải thích chung cho câu hỏi (tùy chọn). Câu tự luận: đây là dải CHỐT trên phiếu chấm — 1 câu ≤ 40 từ, kết luận cốt lõi; không lặp lại trong note"),
    note: z.string().optional().describe("Thẻ 'Ghi nhớ' (markdown): mẹo nhớ, lưu ý, bẫy hay nhầm — hiện sau khi mở đáp án. BẮT BUỘC với câu tự luận, tùy chọn với trắc nghiệm"),
    expanded: z.string().optional().describe("Thẻ 'Mở rộng kiến thức' (markdown): kiến thức VƯỢT đáp án mẫu — bảng so sánh, phân loại, cơ chế, mốc số, hướng xử trí; không chép lại đáp án. BẮT BUỘC với câu tự luận, tùy chọn với trắc nghiệm"),
    source: z.string().optional().describe("Nguồn tài liệu tham khảo đối chiếu (tùy chọn)"),
    reasoning: ReasoningSchema.optional().describe(
      "Thẻ 'Quét dữ kiện & hướng tư duy' {cues, steps, goal} — nên có ở mọi câu: cụm nguyên văn trong đề ➜ suy luận (tổng hợp / bắc cầu 'b1' / loại trừ out) ➜ chốt",
    ),
    case_id: z
      .string()
      .optional()
      .describe("Mã ca lâm sàng. Các câu cùng case_id dùng chung một tình huống lâm sàng và được nhóm liền nhau khi làm bài (tùy chọn)"),
    case_text: z
      .string()
      .optional()
      .describe("Nội dung tình huống/ca lâm sàng dùng chung (markdown; hình vẽ bằng ```mermaid / ```svg được). Nên đặt giống nhau ở mọi câu cùng case_id (tùy chọn)"),
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
        "Tự luận: đáp án mẫu viết liền (markdown) — BỎ khi key_points đã đủ text + why + example (chỉ lặp barem); chỉ viết khi có hình đáp án, bảng/đơn thuốc liền, kịch bản tư vấn dài. fields/list: chia đúng số mục = số ô, mỗi mục mở bằng dòng '1. **Tên mục:**'. Không truyền key_points thì mỗi gạch đầu dòng CẤP 1 ('- ý (1đ)') được tách thành một ý chấm",
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
    // Bước loại trừ: tự luận không có đáp án để gạch; trắc nghiệm không được gạch đáp án đúng
    const correct = new Set(q.correct_answer_indexes ?? [q.correct_answer_index]);
    q.reasoning?.steps.forEach((s, i) => {
      if (!s.out) return;
      const path = ["reasoning", "steps", i, "out"];
      if (q.type === "essay") ctx.addIssue({ code: "custom", path, message: "Tự luận không có đáp án để gạch — bỏ out, ghi kind: 'out'" });
      else if ([...s.out.toUpperCase()].some((ch) => correct.has(ch.charCodeAt(0) - 65)))
        ctx.addIssue({ code: "custom", path, message: "Bước loại trừ gạch nhầm đáp án đúng" });
    });
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

// Hạn link công khai (giờ) — web mặc định 12 giờ; 0 = không hết hạn. Chỉ có tác dụng khi is_public = true.
const publicHours = z
  .number()
  .min(0)
  .max(24 * 365)
  .default(12)
  .describe("Hạn link công khai tính bằng giờ (mặc định 12 như web; 0 = không hết hạn). Chỉ dùng khi is_public = true");

export const CreateQuizSetSchema = z
  .object({
    title: z.string().min(1, "Tiêu đề không được rỗng").max(300).describe("Tiêu đề bộ đề"),
    user_id: z.string().min(1).describe("UID chủ sở hữu bộ đề (Firebase Auth)"),
    questions: z
      .array(QuestionInputSchema)
      .min(1, "Cần ít nhất 1 câu hỏi")
      .describe("Danh sách câu hỏi của bộ đề"),
    // Mặc định RIÊNG TƯ như web (2026-10-28): link công khai có hạn, chia sẻ ở hộp Chia sẻ của web
    is_public: z.boolean().default(false).describe("Công khai (ai có link mở được) — mặc định false, chỉ bật khi user yêu cầu"),
    public_hours: publicHours,
    folder_id: z.string().nullable().default(null).describe("ID thư mục chứa bộ đề, hoặc null"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateQuizSetObjectSchema = z
  .object({
    quiz_id: z.string().min(1).describe("ID bộ đề cần cập nhật"),
    title: z.string().min(1).max(300).optional().describe("Tiêu đề mới (tùy chọn)"),
    is_public: z.boolean().optional().describe("Trạng thái công khai mới (tùy chọn); bật lại = gia hạn tính từ bây giờ"),
    public_hours: publicHours,
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
    name: z.string().trim().min(1, "Tên thư mục không được rỗng").max(200).describe("Tên thư mục"),
    user_id: z.string().min(1).describe("UID chủ sở hữu thư mục"),
    parent_id: z
      .string()
      .nullable()
      .default(null)
      .describe("ID thư mục cha (tạo thành thư mục con), hoặc null để tạo ở Thư viện gốc"),
    icon: folderIcon.default("fa-folder"),
    color: folderColor.default("amber"),
    response_format: responseFormat,
  })
  .strict();

export const EnsureFolderPathSchema = z
  .object({
    user_id: z.string().min(1).describe("UID chủ sở hữu thư mục"),
    path: z
      .string()
      .min(1)
      .max(1000)
      .describe("Đường dẫn phân cấp, ngăn bằng '/' hoặc '>', vd 'Nội khoa / Tim mạch / Suy tim'"),
    parent_id: z
      .string()
      .nullable()
      .default(null)
      .describe("Bắt đầu từ thư mục này thay vì từ gốc (tùy chọn)"),
    icon: folderIcon.optional().describe("Icon cho các thư mục MỚI được tạo (mặc định 'fa-folder')"),
    color: folderColor.optional().describe("Màu cho các thư mục MỚI được tạo (mặc định 'amber')"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateFolderObjectSchema = z
  .object({
    folder_id: z.string().min(1).describe("ID thư mục cần sửa"),
    name: z.string().trim().min(1).max(200).optional().describe("Tên mới"),
    icon: folderIcon.optional(),
    color: folderColor.optional(),
    pinned: z.boolean().optional().describe("Ghim thư mục lên đầu"),
    parent_id: z
      .string()
      .nullable()
      .optional()
      .describe("Chuyển thư mục vào thư mục cha mới, hoặc null để đưa ra Thư viện gốc"),
    response_format: responseFormat,
  })
  .strict();

export const UpdateFolderSchema = UpdateFolderObjectSchema.refine(
  (d) =>
    d.name !== undefined || d.icon !== undefined || d.color !== undefined ||
    d.pinned !== undefined || d.parent_id !== undefined,
  { message: "Cần ít nhất một trường để cập nhật (name/icon/color/pinned/parent_id)" },
);

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
