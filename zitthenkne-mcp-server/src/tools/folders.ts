/**
 * Các tool THƯ MỤC PHÂN CẤP (quiz_folders, lồng nhau qua `parentId`).
 * Quy ước cây giống hệt web app — xem src/services/folders.ts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { z } from "zod";
import { COLLECTIONS, ResponseFormat } from "../constants.js";
import { getFirestore } from "../services/firestore.js";
import { handleError, jsonResult, textResult, toQuizFolder, type ToolResult } from "../services/helpers.js";
import {
  FolderIndex,
  folderName,
  loadUserFolders,
  loadUserQuizBriefs,
  renderTreeMarkdown,
  sortFolders,
  splitFolderPath,
} from "../services/folders.js";
import {
  CreateFolderSchema,
  EnsureFolderPathSchema,
  FolderTreeSchema,
  GetFolderSchema,
  ListFoldersSchema,
  MoveToFolderSchema,
  UpdateFolderObjectSchema,
  UpdateFolderSchema,
} from "../schemas.js";
import type { QuizFolder } from "../types.js";

function ok(format: ResponseFormat, payload: Record<string, unknown>, message: string): ToolResult {
  if (format === ResponseFormat.JSON) return jsonResult({ success: true, ...payload });
  return textResult(message);
}

/** Đọc một thư mục còn sống (không trong thùng rác). Trả về thông báo lỗi nếu không hợp lệ. */
async function getLiveFolder(db: Firestore, id: string): Promise<QuizFolder | string> {
  const snap = await db.collection(COLLECTIONS.QUIZ_FOLDERS).doc(id).get();
  if (!snap.exists) return `Không tìm thấy thư mục với id "${id}".`;
  const f = toQuizFolder(snap);
  if (f.deleted) return `Thư mục "${folderName(f)}" (${id}) đang nằm trong thùng rác.`;
  return f;
}

export function registerFolderTools(server: McpServer): void {
  /* ---------------- quiz_list_folders ---------------- */
  server.registerTool(
    "quiz_list_folders",
    {
      title: "Liệt kê thư mục",
      description: `Liệt kê thư mục (quiz_folders). Thư mục có thể LỒNG NHAU: mỗi thư mục có parentId (null = ở gốc).
Muốn xem toàn bộ cấu trúc phân cấp một lần, dùng quiz_folder_tree.

Args:
  - user_id (string, optional): lọc theo UID chủ sở hữu — khi có, mỗi mục kèm path (đường dẫn từ gốc), depth, số thư mục con, số bộ đề
  - parent_id (string, optional): chỉ lấy con TRỰC TIẾP của thư mục này; 'root' = các thư mục cấp gốc (cần user_id)
  - include_deleted (boolean, mặc định false): lấy cả thư mục trong thùng rác
  - limit (number 1-100, mặc định 20)
  - response_format ('markdown' | 'json')

Returns (JSON): { count, items: [{ id, userId, name, parentId, icon?, color?, pinned?, createdAt, path?, depth?, childCount?, quizCount?, totalQuizCount? }] }`,
      inputSchema: ListFoldersSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof ListFoldersSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        if (!params.user_id) {
          if (params.parent_id) return textResult("parent_id cần đi kèm user_id.", true);
          const snap = await db.collection(COLLECTIONS.QUIZ_FOLDERS).get();
          const items = snap.docs
            .map(toQuizFolder)
            .filter((f) => params.include_deleted || !f.deleted)
            .slice(0, params.limit);
          const output = { count: items.length, items };
          if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
          if (items.length === 0) return textResult("Không có thư mục nào.");
          return textResult(
            [`# Thư mục (${items.length})`, "", ...items.map((f) => `- **${folderName(f)}** (\`${f.id}\`)${f.parentId ? ` · trong \`${f.parentId}\`` : ""}`)].join("\n"),
          );
        }

        const [folders, quizzes] = await Promise.all([
          loadUserFolders(db, params.user_id, params.include_deleted),
          loadUserQuizBriefs(db, params.user_id),
        ]);
        const index = new FolderIndex(folders);
        const tree = index.buildTree(quizzes, { maxDepth: Infinity });
        const flat = new Map<string, (typeof tree)[number]>();
        const walk = (nodes: typeof tree) => nodes.forEach((n) => { flat.set(n.id, n); walk(n.children); });
        walk(tree);

        let list: QuizFolder[];
        if (params.parent_id) {
          const pid = params.parent_id === "root" ? null : params.parent_id;
          if (pid && !index.get(pid)) return textResult(`Không tìm thấy thư mục cha "${pid}".`, true);
          list = index.children(pid);
        } else {
          // Thứ tự duyệt cây (cha trước, con ngay sau) cho dễ đọc
          list = [];
          const visit = (pid: string | null) => index.children(pid).forEach((f) => { list.push(f); visit(f.id); });
          visit(null);
          // Thư mục trong thùng rác (nếu include_deleted) không có vị trí trong cây — đưa xuống cuối
          for (const f of sortFolders(folders)) if (!list.includes(f)) list.push(f);
        }

        const items = list.slice(0, params.limit).map((f) => {
          const n = flat.get(f.id);
          return {
            ...f,
            parentId: index.parentOf(f),
            path: index.pathString(f.id),
            depth: index.pathOf(f.id).length - 1,
            childCount: n?.childCount ?? 0,
            quizCount: n?.quizCount ?? 0,
            totalQuizCount: n?.totalQuizCount ?? 0,
          };
        });
        const output = { count: items.length, total: list.length, items };
        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
        if (items.length === 0) return textResult("Không có thư mục nào.");
        return textResult(
          [
            `# Thư mục (${items.length}/${list.length})`,
            "",
            ...items.map((f) => `- **${f.path}** (\`${f.id}\`) — ${f.totalQuizCount} bộ đề${f.childCount ? ` · ${f.childCount} thư mục con` : ""}${f.deleted ? " · 🗑 thùng rác" : ""}`),
          ].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_folder_tree ---------------- */
  server.registerTool(
    "quiz_folder_tree",
    {
      title: "Cây thư mục phân cấp",
      description: `Trả về TOÀN BỘ cấu trúc thư mục lồng nhau của một người dùng dưới dạng cây (đúng như trên web), kèm số bộ đề / số câu gộp theo từng nhánh.
Dùng trước khi tạo/di chuyển bộ đề để biết nên đặt vào đâu.

Args:
  - user_id (string, bắt buộc)
  - root_id (string, optional): chỉ lấy nhánh bắt đầu từ thư mục này
  - max_depth (1-20, mặc định 10): số cấp tối đa (sâu hơn vẫn được gộp vào số liệu)
  - include_quizzes (boolean, mặc định false): liệt kê bộ đề trong từng thư mục và ở gốc
  - response_format ('markdown' | 'json')

Returns (JSON): { folderCount, rootQuizCount, tree: [{ id, name, parentId, path, depth, quizCount, totalQuizCount, totalQuestionCount, childCount, children: [...], quizzes?: [...] }], rootQuizzes?: [...] }`,
      inputSchema: FolderTreeSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof FolderTreeSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const [folders, quizzes] = await Promise.all([
          loadUserFolders(db, params.user_id),
          loadUserQuizBriefs(db, params.user_id),
        ]);
        const index = new FolderIndex(folders);
        if (params.root_id && !index.get(params.root_id)) {
          return textResult(`Không tìm thấy thư mục "${params.root_id}" (hoặc nó đang trong thùng rác).`, true);
        }
        const tree = index.buildTree(quizzes, {
          rootId: params.root_id ?? null,
          maxDepth: params.max_depth,
          includeQuizzes: params.include_quizzes,
        });
        const rootQuizzes = quizzes.filter((q) => index.quizFolderOf(q) === null);
        const output: Record<string, unknown> = {
          folderCount: folders.length,
          rootQuizCount: rootQuizzes.length,
          tree,
          ...(params.include_quizzes && !params.root_id ? { rootQuizzes } : {}),
        };
        if (params.response_format === ResponseFormat.JSON) return jsonResult(output);

        const title = params.root_id ? `# Nhánh: ${index.pathString(params.root_id)}` : "# Cây thư mục";
        const lines = [title, "", `${folders.length} thư mục · ${quizzes.length} bộ đề (${rootQuizzes.length} ở gốc)`, ""];
        if (!tree.length) lines.push("_Chưa có thư mục nào._");
        lines.push(...renderTreeMarkdown(tree));
        if (params.include_quizzes && !params.root_id && rootQuizzes.length) {
          lines.push("", "## Bộ đề ở Thư viện gốc", ...rootQuizzes.map((q) => `- 📄 ${q.title} (\`${q.id}\`) — ${q.questionCount} câu`));
        }
        return textResult(lines.join("\n"));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_get_folder ---------------- */
  server.registerTool(
    "quiz_get_folder",
    {
      title: "Xem chi tiết thư mục",
      description: `Xem một thư mục: đường dẫn từ gốc (breadcrumb), thư mục con trực tiếp và các bộ đề bên trong.

Args:
  - folder_id (string, bắt buộc)
  - include_subfolders (boolean, mặc định false): liệt kê bộ đề của cả cây con
  - response_format ('markdown' | 'json')

Returns (JSON): { folder, path: [{ id, name }], children: [{ id, name, totalQuizCount, childCount }], quizzes: [{ id, title, questionCount, folderId, folderPath }] }`,
      inputSchema: GetFolderSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof GetFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const snap = await db.collection(COLLECTIONS.QUIZ_FOLDERS).doc(params.folder_id).get();
        if (!snap.exists) return textResult(`Không tìm thấy thư mục với id "${params.folder_id}".`, true);
        const folder = toQuizFolder(snap);
        const [folders, quizzes] = await Promise.all([
          loadUserFolders(db, folder.userId, true),
          loadUserQuizBriefs(db, folder.userId),
        ]);
        // Thư mục đang trong thùng rác: vẫn xem được nội dung, nhưng cây "sống" không chứa nó
        const index = new FolderIndex(folders.filter((f) => !f.deleted || f.id === folder.id));
        const scope = new Set([folder.id, ...(params.include_subfolders ? index.descendants(folder.id) : [])]);
        const inside = quizzes
          .filter((q) => q.folderId && scope.has(q.folderId))
          .map((q) => ({ ...q, folderPath: index.pathString(q.folderId!) }));
        const [node] = index.buildTree(quizzes, { rootId: folder.id, maxDepth: 2 });
        const children = (node?.children ?? []).map((c) => ({
          id: c.id, name: c.name, totalQuizCount: c.totalQuizCount, childCount: c.childCount,
        }));
        const path = index.pathOf(folder.id).map((f) => ({ id: f.id, name: folderName(f) }));
        const output = { folder: { ...folder, parentId: index.parentOf(folder) }, path, children, quizzes: inside };
        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "quizzes");

        const lines = [
          `# 📁 ${folderName(folder)}`,
          "",
          `Đường dẫn: Thư viện gốc / ${path.map((p) => p.name).join(" / ")}`,
          `ID: \`${folder.id}\`${folder.deleted ? " · 🗑 đang trong thùng rác" : ""}`,
          "",
          `## Thư mục con (${children.length})`,
          ...(children.length ? children.map((c) => `- 📁 **${c.name}** (\`${c.id}\`) — ${c.totalQuizCount} bộ đề`) : ["_Không có_"]),
          "",
          `## Bộ đề${params.include_subfolders ? " (cả cây con)" : ""} (${inside.length})`,
          ...(inside.length
            ? inside.map((q) => `- 📄 ${q.title} (\`${q.id}\`) — ${q.questionCount} câu${params.include_subfolders && q.folderId !== folder.id ? ` · ${q.folderPath}` : ""}`)
            : ["_Không có_"]),
        ];
        return textResult(lines.join("\n"));
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
      description: `Tạo thư mục mới trong quiz_folders. Truyền parent_id để tạo THƯ MỤC CON (lồng nhiều cấp như trên web).
Muốn tạo cả chuỗi "A / B / C" một lần (bỏ qua cấp đã có), dùng quiz_ensure_folder_path.

Args:
  - name (string, bắt buộc)
  - user_id (string, bắt buộc): UID chủ sở hữu
  - parent_id (string | null, mặc định null = Thư viện gốc)
  - icon (string 'fa-xxx', mặc định 'fa-folder'), color (amber/pink/red/green/blue/indigo/purple/#RRGGBB, mặc định amber)
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, name, parentId, path }`,
      inputSchema: CreateFolderSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof CreateFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        let parentPath = "";
        if (params.parent_id) {
          const parent = await getLiveFolder(db, params.parent_id);
          if (typeof parent === "string") return textResult(parent, true);
          if (parent.userId !== params.user_id) {
            return textResult(`Thư mục cha "${folderName(parent)}" thuộc người dùng khác.`, true);
          }
          const index = new FolderIndex(await loadUserFolders(db, params.user_id));
          parentPath = index.pathString(parent.id);
        }
        const ref = await db.collection(COLLECTIONS.QUIZ_FOLDERS).add({
          userId: params.user_id,
          name: params.name,
          icon: params.icon,
          color: params.color,
          parentId: params.parent_id,
          createdAt: FieldValue.serverTimestamp(),
        });
        const path = parentPath ? `${parentPath} / ${params.name}` : params.name;
        return ok(
          params.response_format,
          { id: ref.id, name: params.name, parentId: params.parent_id, path },
          `Đã tạo thư mục "${path}". ID: ${ref.id}`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_ensure_folder_path ---------------- */
  server.registerTool(
    "quiz_ensure_folder_path",
    {
      title: "Tạo/lấy thư mục theo đường dẫn",
      description: `Bảo đảm tồn tại chuỗi thư mục lồng nhau theo đường dẫn, vd "Nội khoa / Tim mạch / Suy tim":
cấp nào đã có (trùng tên, không phân biệt hoa thường) thì dùng lại, thiếu cấp nào thì tạo cấp đó. Idempotent — gọi lại không tạo trùng.
Trả về ID thư mục cuối cùng để dùng làm folder_id khi tạo/di chuyển bộ đề.

Args:
  - user_id (string, bắt buộc)
  - path (string, bắt buộc): ngăn cấp bằng '/' hoặc '>'
  - parent_id (string | null, optional): bắt đầu từ thư mục này thay vì gốc
  - icon, color (optional): áp dụng cho các thư mục MỚI tạo
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, path, created: [{ id, name }], reused: [{ id, name }] }`,
      inputSchema: EnsureFolderPathSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof EnsureFolderPathSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const names = splitFolderPath(params.path);
        if (!names.length) return textResult("Đường dẫn rỗng.", true);
        if (names.some((n) => n.length > 200)) return textResult("Mỗi tên thư mục tối đa 200 ký tự.", true);

        const folders = await loadUserFolders(db, params.user_id);
        const index = new FolderIndex(folders);
        if (params.parent_id && !index.get(params.parent_id)) {
          return textResult(`Không tìm thấy thư mục cha "${params.parent_id}" của người dùng này (hoặc nó đang trong thùng rác).`, true);
        }

        let current: string | null = params.parent_id ?? null;
        const created: { id: string; name: string }[] = [];
        const reused: { id: string; name: string }[] = [];
        // Thư mục mới tạo chưa có trong index → giữ cha của chuỗi mới tạo để các cấp sau nối đúng
        let creating = false;
        for (const name of names) {
          const existing = creating ? undefined : index.findChildByName(current, name);
          if (existing) {
            reused.push({ id: existing.id, name: folderName(existing) });
            current = existing.id;
            continue;
          }
          creating = true;
          const ref = await db.collection(COLLECTIONS.QUIZ_FOLDERS).add({
            userId: params.user_id,
            name,
            icon: params.icon ?? "fa-folder",
            color: params.color ?? "amber",
            parentId: current,
            createdAt: FieldValue.serverTimestamp(),
          });
          created.push({ id: ref.id, name });
          current = ref.id;
        }

        const base = params.parent_id ? `${index.pathString(params.parent_id)} / ` : "";
        const fullPath = base + [...reused, ...created].map((f) => f.name).join(" / ");
        return ok(
          params.response_format,
          { id: current, path: fullPath, created, reused },
          created.length
            ? `Thư mục "${fullPath}" sẵn sàng (ID: ${current}). Tạo mới ${created.length} cấp: ${created.map((f) => f.name).join(", ")}.`
            : `Thư mục "${fullPath}" đã có sẵn (ID: ${current}).`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- quiz_update_folder ---------------- */
  server.registerTool(
    "quiz_update_folder",
    {
      title: "Sửa / di chuyển thư mục",
      description: `Đổi tên, icon, màu, ghim, hoặc CHUYỂN thư mục sang thư mục cha khác (kéo theo toàn bộ thư mục con & bộ đề bên trong).
Chặn việc chuyển một thư mục vào chính nó hoặc vào con cháu của nó.

Args:
  - folder_id (string, bắt buộc)
  - name, icon, color, pinned (optional)
  - parent_id (string | null, optional): thư mục cha mới; null = đưa ra Thư viện gốc
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, updated: [...], path }`,
      inputSchema: UpdateFolderObjectSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof UpdateFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const fields = ["name", "icon", "color", "pinned", "parent_id"] as const;
        if (!fields.some((k) => params[k] !== undefined)) {
          return textResult("Cần ít nhất một trường để cập nhật (name/icon/color/pinned/parent_id).", true);
        }
        const folder = await getLiveFolder(db, params.folder_id);
        if (typeof folder === "string") return textResult(folder, true);

        const index = new FolderIndex(await loadUserFolders(db, folder.userId));
        const update: Record<string, unknown> = {};
        if (params.name !== undefined) update.name = params.name;
        if (params.icon !== undefined) update.icon = params.icon;
        if (params.color !== undefined) update.color = params.color;
        if (params.pinned !== undefined) update.pinned = params.pinned;
        if (params.parent_id !== undefined) {
          const target = params.parent_id;
          if (target && !index.get(target)) {
            return textResult(`Không tìm thấy thư mục đích "${target}" của cùng người dùng (hoặc nó đang trong thùng rác).`, true);
          }
          if (!index.canMoveInto(folder.id, target)) {
            return textResult("Không thể chuyển thư mục vào chính nó hoặc vào thư mục con cháu của nó.", true);
          }
          update.parentId = target;
          // Thứ tự kéo-thả cũ thuộc cấp cũ — bỏ đi để web xếp nó theo thời gian ở cấp mới
          update.order = FieldValue.delete();
        }

        await db.collection(COLLECTIONS.QUIZ_FOLDERS).doc(folder.id).update(update);
        const parentPath = update.parentId !== undefined
          ? (params.parent_id ? index.pathString(params.parent_id) : "")
          : (index.parentOf(folder) ? index.pathString(index.parentOf(folder)!) : "");
        const name = params.name ?? folderName(folder);
        const path = parentPath ? `${parentPath} / ${name}` : name;
        const changed = Object.keys(update).filter((k) => k !== "order");
        return ok(
          params.response_format,
          { id: folder.id, updated: changed, path },
          `Đã cập nhật thư mục "${path}": ${changed.join(", ")}.`,
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
      description: `Đặt folderId của một bộ đề (thư mục ở cấp nào cũng được). Truyền folder_id=null để chuyển về Thư viện gốc.
Kiểm tra thư mục đích tồn tại, không nằm trong thùng rác và cùng chủ sở hữu với bộ đề.

Args:
  - quiz_id (string, bắt buộc)
  - folder_id (string | null, bắt buộc)
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, folderId, path }`,
      inputSchema: MoveToFolderSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof MoveToFolderSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.QUIZ_SETS).doc(params.quiz_id);
        const doc = await ref.get();
        if (!doc.exists) return textResult(`Không tìm thấy bộ đề với id "${params.quiz_id}".`, true);

        let path = "Thư viện gốc";
        if (params.folder_id) {
          const folder = await getLiveFolder(db, params.folder_id);
          if (typeof folder === "string") return textResult(folder, true);
          const owner = doc.get("userId");
          if (owner && folder.userId !== owner) {
            return textResult(`Thư mục "${folderName(folder)}" thuộc người dùng khác với chủ bộ đề.`, true);
          }
          path = new FolderIndex(await loadUserFolders(db, folder.userId)).pathString(folder.id);
        }

        await ref.update({ folderId: params.folder_id });
        return ok(
          params.response_format,
          { id: params.quiz_id, folderId: params.folder_id, path },
          `Đã chuyển bộ đề ${params.quiz_id} vào "${path}".`,
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
