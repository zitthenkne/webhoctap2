#!/usr/bin/env node
/**
 * MCP Server cho web app học tập Zitthenkne.
 *
 * Cung cấp cho agent các tool đọc/ghi dữ liệu Firestore của app:
 * tra cứu, tìm, xem chi tiết bộ đề; xem kết quả & thống kê; tạo/sửa/xóa
 * bộ đề, câu hỏi và thư mục.
 *
 * Transport: stdio (chạy cục bộ như một subprocess của MCP client).
 *
 * Biến môi trường:
 *   - FIREBASE_SERVICE_ACCOUNT_PATH  (đường dẫn JSON khóa service account) HOẶC
 *   - FIREBASE_SERVICE_ACCOUNT_JSON  (nội dung JSON) HOẶC
 *   - GOOGLE_APPLICATION_CREDENTIALS (chuẩn ADC)
 *   - FIREBASE_PROJECT_ID            (mặc định "zitthenkne")
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

const server = new McpServer({
  name: "zitthenkne-mcp-server",
  version: "1.0.0",
});

registerReadTools(server);
registerWriteTools(server);

async function main(): Promise<void> {
  const hasCredentials =
    !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!hasCredentials) {
    console.error(
      "CẢNH BÁO: Chưa cấu hình thông tin xác thực Firebase. " +
        "Đặt FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, " +
        "hoặc GOOGLE_APPLICATION_CREDENTIALS. Các tool sẽ báo lỗi cho đến khi cấu hình.",
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zitthenkne MCP server đang chạy qua stdio.");
}

main().catch((error) => {
  console.error("Lỗi khởi động server:", error);
  process.exit(1);
});
