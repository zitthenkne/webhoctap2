/**
 * Hằng số dùng chung cho Zitthenkne MCP server.
 */

// Project ID Firebase của app Zitthenkne (lấy từ core/firebase-init.js của web app)
export const DEFAULT_PROJECT_ID = "zitthenkne";

// Giới hạn ký tự của một phản hồi tool để tránh tràn context của agent.
export const CHARACTER_LIMIT = 25000;

// Tên các collection trong Firestore.
export const COLLECTIONS = {
  QUIZ_SETS: "quiz_sets",
  QUIZ_FOLDERS: "quiz_folders",
  QUIZ_RESULTS: "quiz_results",
  STUDY_ROOMS: "study_rooms",
  USERS: "users",
} as const;

// Định dạng phản hồi.
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}
