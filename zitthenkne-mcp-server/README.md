# Zitthenkne MCP Server

MCP server cho web app học tập **Zitthenkne** (Firebase Firestore). Cho phép các MCP client (Claude Desktop, Cursor, …) tra cứu, tạo, sửa, xóa bộ đề trắc nghiệm và xem thống kê — thông qua Firebase Admin SDK.

## Tính năng (tools)

Đọc (read-only):

- `quiz_list_sets` — liệt kê bộ đề (lọc theo user, thư mục, công khai; có phân trang)
- `quiz_search_sets` — tìm bộ đề theo tiêu đề
- `quiz_get_set` — xem chi tiết một bộ đề kèm câu hỏi
- `quiz_list_folders` — liệt kê thư mục
- `quiz_list_results` — liệt kê kết quả làm bài
- `quiz_get_user_stats` — thống kê tổng hợp của một người dùng

Ghi (cần quyền ghi Firestore):

- `quiz_create_set` — tạo bộ đề mới
- `quiz_update_set` — sửa tiêu đề / công khai / thư mục
- `quiz_add_question` — thêm câu hỏi
- `quiz_update_question` — sửa một câu hỏi
- `quiz_delete_question` — xóa một câu hỏi
- `quiz_delete_set` — xóa bộ đề (bắt buộc `confirm=true`)
- `quiz_create_folder` — tạo thư mục
- `quiz_move_to_folder` — di chuyển bộ đề vào thư mục

## Yêu cầu

- Node.js >= 18
- Một **service account key** của project Firebase `zitthenkne`

## 1. Lấy khóa service account

1. Vào [Firebase Console](https://console.firebase.google.com/) → chọn project `zitthenkne`.
2. **Project Settings** (bánh răng) → tab **Service accounts**.
3. Bấm **Generate new private key** → tải file JSON về.
4. Đổi tên thành `service-account.json` và đặt trong thư mục này (đã được `.gitignore` bỏ qua — **tuyệt đối không commit/chia sẻ khóa này**).

## 2. Cài đặt & build

```bash
cd zitthenkne-mcp-server
npm install
npm run build
```

Lệnh `build` tạo `dist/index.js` (điểm chạy chính).

## 3. Cấu hình MCP client

Thêm vào file cấu hình MCP (ví dụ `claude_desktop_config.json` của Claude Desktop):

```json
{
  "mcpServers": {
    "zitthenkne": {
      "command": "node",
      "args": ["C:/Users/admin/Documents/GitHub/webhoctap2/zitthenkne-mcp-server/dist/index.js"],
      "env": {
        "FIREBASE_SERVICE_ACCOUNT_PATH": "C:/Users/admin/Documents/GitHub/webhoctap2/zitthenkne-mcp-server/service-account.json",
        "FIREBASE_PROJECT_ID": "zitthenkne"
      }
    }
  }
}
```

Khởi động lại client. Khi kết nối thành công, bạn sẽ thấy các tool `quiz_*`.

### Biến môi trường

| Biến | Mô tả |
|------|-------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Đường dẫn tới file JSON khóa service account (cách khuyến nghị) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Dán thẳng nội dung JSON khóa (thay cho đường dẫn) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Chuẩn Google ADC (đường dẫn JSON) |
| `FIREBASE_PROJECT_ID` | Project ID, mặc định `zitthenkne` |

Cấu hình **một** trong ba cách xác thực đầu tiên.

## 4. Kiểm thử nhanh

Dùng MCP Inspector để thử tool trực tiếp:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json npx @modelcontextprotocol/inspector node dist/index.js
```

## Mô hình dữ liệu Firestore

Suy ra từ mã nguồn web app:

- `quiz_sets`: `{ userId, title, questionCount, questions[], isPublic, folderId, createdAt }`
  - `questions[i]`: `{ question, answers[], correctAnswerIndex, optionExplanations?, explanation? }`
- `quiz_folders`: `{ userId, name, createdAt }`
- `quiz_results`: `{ userId, quizId, quizTitle, score, totalQuestions, percentage, timeTaken, completedAt }`
- `users`: `{ quizSetsCreated, … }`

## Lưu ý bảo mật

- Service account có **toàn quyền** đọc/ghi Firestore và **bỏ qua** Security Rules. Giữ khóa bí mật, không commit, không chia sẻ.
- Tool `quiz_delete_set` xóa vĩnh viễn và yêu cầu `confirm=true` để tránh xóa nhầm.
- Server dùng transport **stdio** (chạy cục bộ). Không mở cổng mạng.

## Cấu trúc dự án

```
zitthenkne-mcp-server/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts            # Điểm vào, khởi tạo server + stdio transport
│   ├── constants.ts        # Hằng số, tên collection, ResponseFormat
│   ├── types.ts            # Kiểu dữ liệu Firestore
│   ├── schemas.ts          # Zod schema validate input
│   ├── services/
│   │   ├── firestore.ts    # Khởi tạo Firebase Admin
│   │   └── helpers.ts      # Chuẩn hóa document, format, xử lý lỗi
│   └── tools/
│       ├── read.ts         # 6 tool đọc
│       └── write.ts        # 8 tool ghi
└── dist/                   # JS sau khi build
```
