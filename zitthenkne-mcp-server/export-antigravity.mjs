import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { registerReadTools } from "./dist/tools/read.js";
import { registerWriteTools } from "./dist/tools/write.js";
import { registerRecordTools } from "./dist/tools/record.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_DIRS = [
  "C:/Users/admin/.gemini/antigravity/mcp/zitthenkne",
  "C:/Users/admin/.gemini/antigravity-ide/mcp/zitthenkne",
];

const server = new McpServer({
  name: "zitthenkne-mcp-server",
  version: "1.0.0",
});

registerReadTools(server);
registerWriteTools(server);
registerRecordTools(server);

// @ts-ignore
const registeredTools = server._registeredTools || {};
const toolNames = Object.keys(registeredTools);

console.log(`Tìm thấy ${toolNames.length} tools.`);

const INSTRUCTIONS_MD = `# MCP Server: zitthenkne

Server kết nối trực tiếp với cơ sở dữ liệu Firebase Firestore của ứng dụng Zitthenkne (https://zitthenkne.vercel.app/).

## 1. Nhóm Quản lý Đề thi Trắc nghiệm & Tự luận (Quiz Sets)
- \`quiz_list_sets\`: Liệt kê các bộ đề (hỗ trợ phân trang, lọc theo user, thư mục, chế độ công khai).
- \`quiz_search_sets\`: Tìm kiếm bộ đề theo từ khóa tiêu đề (không phân biệt hoa thường).
- \`quiz_get_set\`: Lấy chi tiết toàn bộ nội dung câu hỏi, đáp án, giải thích, barem của 1 bộ đề.
- \`quiz_create_set\`: Tạo bộ đề mới (hỗ trợ cả trắc nghiệm mcq lẫn tự luận essay, case chùm lâm sàng, ô trả lời đa dạng).
- \`quiz_update_set\`: Cập nhật tiêu đề, quyền công khai hoặc thư mục của bộ đề.
- \`quiz_add_question\`: Thêm câu hỏi mới vào bộ đề có sẵn.
- \`quiz_update_question\`: Chỉnh sửa nội dung câu hỏi trong bộ đề theo index.
- \`quiz_delete_question\`: Xóa câu hỏi khỏi bộ đề theo index.
- \`quiz_delete_set\`: Xóa toàn bộ bộ đề (yêu cầu \`confirm: true\`).
- \`quiz_list_folders\`: Xem danh sách thư mục bài học.
- \`quiz_create_folder\`: Tạo thư mục mới.
- \`quiz_move_to_folder\`: Chuyển bộ đề vào thư mục hoặc đưa ra ngoài gốc.
- \`quiz_list_results\`: Xem kết quả làm bài của học viên.
- \`quiz_get_user_stats\`: Lấy thống kê chi tiết của người dùng.

### Quy chuẩn Câu hỏi Tự luận & Trắc nghiệm:
- **Tự luận (\`type: 'essay'\`)**: Dùng \`model_answer\` + \`key_points\` (barem có keywords), bắt buộc có \`note\` và \`expanded\`, không truyền \`answers\` / \`correct_answer_index\`.
- **Kiểu ô trả lời (\`answer_format\`)**: \`text\` (mặc định), \`short\` (1 dòng), \`list\` (N ô), \`fields\` (các ô có nhãn cụ thể), \`table\` (bảng cột x hàng).
- **Ca lâm sàng / Case chùm**: Dùng \`case_id\`, \`case_title\`, \`case_text\`, \`case_reveal\` (ca mở dần từng bước).
- **Trắc nghiệm nhiều đáp án đúng**: Dùng \`correct_answer_indexes: [0, 2, ...]\`.

## 2. Nhóm Quản lý Bệnh án Lâm sàng (Medical Records)
Dữ liệu đồng bộ với trang Tạo Bệnh Án (\`features/medical-record/tao-benh-an.html\`) và Danh Sách Bệnh Án (\`features/study-room/waiting-room.html\`) trên web:
- \`record_list\`: Liệt kê danh sách bệnh án của UID, tính toán sẵn tỷ lệ hoàn thiện % của bệnh án học thuật.
- \`record_search\`: Tìm kiếm bệnh án theo họ tên bệnh nhân, lý do vào viện, chẩn đoán (không phân biệt dấu tiếng Việt).
- \`record_get\`: Xem toàn bộ chi tiết hồ sơ bệnh án hoặc trích xuất theo danh sách \`paths\` (ví dụ: \`['hanhChinh.hoTen', 'benhSu', 'chanDoanXacDinh']\`).
- \`record_create\`: Tạo hồ sơ bệnh án mới (tự sinh ID chuẩn \`BA-<timestamp>\`).
- \`record_update\`: Cập nhật các mục trong bệnh án theo cấu trúc dot-notation (\`fields\`). Tự động cập nhật \`lastUpdated\` để đồng bộ đè lên Firestore khi người dùng mở web.
- \`record_delete\`: Xóa hồ sơ bệnh án trên cloud (yêu cầu \`confirm: true\`).
`;

for (const targetDir of TARGET_DIRS) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Ghi instructions.md
  fs.writeFileSync(path.join(targetDir, "instructions.md"), INSTRUCTIONS_MD, "utf-8");

  // Ghi từng tool schema json
  for (const [name, tool] of Object.entries(registeredTools)) {
    const jsonSchema = zodToJsonSchema(tool.inputSchema, {
      name,
      $refStrategy: "none",
    });

    // Strip top-level metadata wrapper if zodToJsonSchema created one
    const schemaParams = jsonSchema.definitions?.[name] || jsonSchema;
    delete schemaParams.$schema;

    const toolDef = {
      name,
      description: tool.description,
      parameters: {
        $schema: "http://json-schema.org/draft-07/schema#",
        ...schemaParams,
      },
    };

    const outPath = path.join(targetDir, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(toolDef, null, 2), "utf-8");
    console.log(`Đã xuất: ${name} -> ${outPath}`);
  }
}

console.log("Hoàn tất xuất toàn bộ MCP schemas cho Zitthenkne!");
