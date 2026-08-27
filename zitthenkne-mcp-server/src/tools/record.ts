/**
 * Tool BỆNH ÁN (collection `medical_records`) — dữ liệu của hai trang
 * features/medical-record/tao-benh-an.html (viết bệnh án) và
 * features/study-room/waiting-room.html (danh sách bệnh án).
 *
 * Cấu trúc document (xem features/medical-record/record-store.js):
 *   id      = `${userId}__${recordId}`  (dấu "/" trong recordId đổi thành "_")
 *   fields  = { userId, recordId, lastUpdated, record }
 *   record  = toàn bộ nội dung bệnh án, BẮT BUỘC có `record.id` và `record.lastUpdated`
 *             (web app trộn local/cloud theo lastUpdated — bản mới hơn thắng).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocumentData } from "firebase-admin/firestore";
import type { z } from "zod";
import { COLLECTIONS, ResponseFormat } from "../constants.js";
import { getFirestore } from "../services/firestore.js";
import { handleError, jsonResult, textResult, type ToolResult } from "../services/helpers.js";
import {
  CreateRecordSchema,
  DeleteRecordSchema,
  GetRecordSchema,
  ListRecordsSchema,
  SearchRecordsSchema,
  UpdateRecordSchema,
} from "../schemas.js";

type Rec = Record<string, any>;

/** ID document giống hệt web app (record-store.js: docIdOf). */
const docIdOf = (uid: string, id: string): string => `${uid}__${String(id).replace(/\//g, "_")}`;

/** Các mục bắt buộc của một bệnh án học thuật — dùng tính % hoàn thiện (waiting-room.js). */
const SCORE_PATHS = [
  "hanhChinh.hoTen", "hanhChinh.gioiTinh", "hanhChinh.ngheNghiep", "hanhChinh.diaChi",
  "hanhChinh.ngayVaoVien", "hanhChinh.ngayLamBenhAn", "hanhChinh.benhVien",
  "lyDoVaoVien", "benhSu",
  "tienSu.noiKhoa", "tienSu.ngoaiKhoa", "tienSu.diUng", "tienSu.thoiQuen", "tienSu.giaDinh",
  "khamBenh.sinhTon.mach", "khamBenh.sinhTon.huyetAp", "khamBenh.sinhTon.nhietDo", "khamBenh.sinhTon.nhipTho",
  "khamBenh.tongTrang", "khamBenh.tim", "khamBenh.phoi", "khamBenh.bung", "khamBenh.thanKinhCoXuongKhop",
  "tomTatBenhAn", "datVanDe", "chanDoanSoBo", "chanDoanPhanBiet", "bienLuanChanDoan",
  "canLamSangDeNghi", "chanDoanXacDinh", "huongDieuTri", "tienLuong",
];

function getPath(obj: Rec, path: string): unknown {
  return path.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj: Rec, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Rec = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]!] = value;
}

/** % hoàn thiện: đếm số mục bắt buộc đã có nội dung. */
function completeness(rec: Rec): number {
  const done = SCORE_PATHS.filter((p) => String(getPath(rec, p) ?? "").trim() !== "").length;
  return Math.round((done / SCORE_PATHS.length) * 100);
}

/** Bỏ dấu tiếng Việt + hạ chữ thường, để tìm kiếm dễ khớp. */
const fold = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d");

/** Tóm tắt một bệnh án (không kèm toàn bộ nội dung) — giống thẻ ở trang danh sách. */
function toSummary(data: DocumentData): Rec {
  const rec: Rec = data.record ?? {};
  const h: Rec = rec.hanhChinh ?? {};
  return {
    id: String(rec.id ?? data.recordId ?? ""),
    userId: data.userId ?? "",
    hoTen: h.hoTen ?? "",
    tuoi: h.tuoi ?? "",
    gioiTinh: h.gioiTinh ?? "",
    benhVien: h.benhVien ?? "",
    khoa: h.khoa ?? "",
    ngayVaoVien: h.ngayVaoVien ?? "",
    lyDoVaoVien: rec.lyDoVaoVien ?? "",
    chanDoan: rec.chanDoanXacDinh || rec.chanDoanSoBo || "",
    thuMuc: rec.thuMuc?.ten ?? null,
    thuMucId: rec.thuMuc?.id ?? null,
    soLanTheoDoi: Array.isArray(rec.theoDoi) ? rec.theoDoi.length : 0,
    hoanThien: completeness(rec),
    lastUpdated: rec.lastUpdated ?? data.lastUpdated ?? null,
  };
}

function summaryLine(s: Rec): string {
  const meta = [s.tuoi && `${s.tuoi} tuổi`, s.gioiTinh, s.benhVien].filter(Boolean).join(" · ");
  const cd = s.chanDoan ? ` — ${s.chanDoan}` : "";
  const folder = s.thuMuc ? ` · ${s.thuMuc}` : "";
  return `- **${s.hoTen || "Chưa đặt tên"}** (\`${s.id}\`)${cd}\n  ${meta || "chưa có hành chính"} · hoàn thiện ${s.hoanThien}%${folder}`;
}

/** Lấy mọi bệnh án của một UID (Firestore không lọc sâu được nếu chưa tạo index). */
async function fetchRecords(userId: string): Promise<DocumentData[]> {
  const db = getFirestore();
  const snap = await db.collection(COLLECTIONS.MEDICAL_RECORDS).where("userId", "==", userId).get();
  return snap.docs.map((d) => d.data()).filter((d) => d.record);
}

export function registerRecordTools(server: McpServer): void {
  /* ---------------- record_list ---------------- */
  server.registerTool(
    "record_list",
    {
      title: "Liệt kê bệnh án",
      description: `Liệt kê bệnh án của một người dùng (collection medical_records) — đúng dữ liệu trang waiting-room.html.

Args:
  - user_id (string, bắt buộc): UID chủ sở hữu
  - folder_id (string, optional): lọc theo đợt thực hành (record.thuMuc.id); 'root' = bệnh án ngoài thư mục
  - limit (1-100, mặc định 20), offset (mặc định 0)
  - response_format ('markdown' | 'json')

Returns (JSON): { total, count, offset, has_more, items: [{ id, hoTen, tuoi, gioiTinh, benhVien, lyDoVaoVien, chanDoan, thuMuc, hoanThien, lastUpdated }] }
Sắp xếp theo lastUpdated giảm dần. Không kèm nội dung đầy đủ — dùng record_get.`,
      inputSchema: ListRecordsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof ListRecordsSchema>): Promise<ToolResult> => {
      try {
        let all = (await fetchRecords(params.user_id)).map(toSummary);
        if (params.folder_id) {
          const want = params.folder_id === "root" ? "" : String(params.folder_id);
          all = all.filter((s) => String(s.thuMucId ?? "") === want);
        }
        all.sort((a, b) => String(b.lastUpdated ?? "").localeCompare(String(a.lastUpdated ?? "")));

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
        if (page.length === 0) return textResult("Không có bệnh án nào khớp bộ lọc.");
        const lines = [`# Bệnh án (${total} tổng, hiển thị ${page.length})`, "", ...page.map(summaryLine)];
        if (hasMore) lines.push("", `_Còn nữa — dùng offset=${params.offset + page.length}_`);
        return textResult(lines.join("\n"));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- record_search ---------------- */
  server.registerTool(
    "record_search",
    {
      title: "Tìm bệnh án",
      description: `Tìm bệnh án theo từ khóa trong họ tên, lý do vào viện, chẩn đoán sơ bộ/xác định. Không phân biệt hoa thường và dấu tiếng Việt.

Args:
  - user_id (string, bắt buộc), query (string, bắt buộc)
  - limit (1-100, mặc định 20), response_format ('markdown' | 'json')

Returns (JSON): { query, count, items: [...] } — cùng dạng tóm tắt với record_list.`,
      inputSchema: SearchRecordsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof SearchRecordsSchema>): Promise<ToolResult> => {
      try {
        const needle = fold(params.query);
        const items = (await fetchRecords(params.user_id))
          .map(toSummary)
          .filter((s) => [s.hoTen, s.lyDoVaoVien, s.chanDoan].some((f) => fold(f).includes(needle)))
          .sort((a, b) => String(b.lastUpdated ?? "").localeCompare(String(a.lastUpdated ?? "")))
          .slice(0, params.limit);

        const output = { query: params.query, count: items.length, items };
        if (params.response_format === ResponseFormat.JSON) return jsonResult(output, "items");
        if (items.length === 0) return textResult(`Không tìm thấy bệnh án nào khớp "${params.query}".`);
        return textResult(
          [`# Kết quả cho "${params.query}" (${items.length})`, "", ...items.map(summaryLine)].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- record_get ---------------- */
  server.registerTool(
    "record_get",
    {
      title: "Xem chi tiết bệnh án",
      description: `Lấy nội dung một bệnh án. Trả về đúng object 'record' mà trang tao-benh-an.html đọc/ghi.

Args:
  - user_id (string, bắt buộc), record_id (string, bắt buộc, dạng 'BA-...')
  - paths (string[], optional): chỉ lấy vài mục, vd ['hanhChinh.hoTen', 'benhSu', 'chanDoanSoBo']
  - response_format ('markdown' | 'json')

Các mục chính: hanhChinh.* (hoTen, namSinh, tuoi, gioiTinh, ngheNghiep, diaChi, ngayVaoVien, benhVien, khoa, soPhong, soGiuong),
lyDoVaoVien, benhSu, benhSuChiTiet.*, tienSu.* (noiKhoa, ngoaiKhoa, diUng, thoiQuen, giaDinh),
khamBenh.* (sinhTon.mach/huyetAp/nhietDo/nhipTho, tongTrang, tim, phoi, bung, thanKinhCoXuongKhop),
tomTatBenhAn, datVanDe, chanDoanSoBo, chanDoanPhanBiet, bienLuanChanDoan, canLamSangDeNghi,
chanDoanXacDinh, huongDieuTri, tienLuong, theoDoi[], thuMuc{ id, ten }.

Returns (JSON): { id, userId, lastUpdated, hoanThien, record }`,
      inputSchema: GetRecordSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof GetRecordSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const snap = await db
          .collection(COLLECTIONS.MEDICAL_RECORDS)
          .doc(docIdOf(params.user_id, params.record_id))
          .get();
        if (!snap.exists) {
          return textResult(`Không tìm thấy bệnh án '${params.record_id}' của UID ${params.user_id}.`, true);
        }
        const data = snap.data() ?? {};
        const full: Rec = data.record ?? {};
        const record: Rec = params.paths?.length
          ? Object.fromEntries(params.paths.map((p) => [p, getPath(full, p) ?? null]))
          : full;

        const output = {
          id: String(full.id ?? data.recordId ?? params.record_id),
          userId: data.userId ?? params.user_id,
          lastUpdated: full.lastUpdated ?? data.lastUpdated ?? null,
          hoanThien: completeness(full),
          record,
        };
        if (params.response_format === ResponseFormat.JSON) return jsonResult(output);

        const s = toSummary(data);
        return textResult(
          [
            `# Bệnh án ${s.hoTen || "(chưa đặt tên)"} (\`${output.id}\`)`,
            "",
            `Hoàn thiện ${output.hoanThien}% · cập nhật ${output.lastUpdated ?? "?"}`,
            "",
            "```json",
            JSON.stringify(record, null, 2),
            "```",
          ].join("\n"),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- record_create ---------------- */
  server.registerTool(
    "record_create",
    {
      title: "Tạo bệnh án mới",
      description: `Tạo một bệnh án mới trong medical_records. ID mặc định dạng 'BA-<timestamp>' giống web app.

Args:
  - user_id (string, bắt buộc): UID chủ sở hữu
  - record_id (string, optional): tự sinh nếu bỏ trống
  - fields (object, optional): map đường dẫn -> giá trị, vd { "hanhChinh.hoTen": "Nguyễn Văn A", "lyDoVaoVien": "Đau ngực" }
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, hoanThien }
Lưu ý: web app dùng localStorage làm bản chính; bệnh án tạo ở đây chỉ hiện ra sau khi trang đồng bộ từ cloud (mở lại danh sách bệnh án khi đã đăng nhập).`,
      inputSchema: CreateRecordSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof CreateRecordSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const id = params.record_id || `BA-${Date.now()}`;
        const ref = db.collection(COLLECTIONS.MEDICAL_RECORDS).doc(docIdOf(params.user_id, id));
        if ((await ref.get()).exists) {
          return textResult(`Bệnh án '${id}' đã tồn tại — dùng record_update để sửa.`, true);
        }

        const record: Rec = { id };
        for (const [path, value] of Object.entries(params.fields ?? {})) setPath(record, path, value);
        record.lastUpdated = new Date().toISOString();

        await ref.set({ userId: params.user_id, recordId: id, lastUpdated: record.lastUpdated, record });
        const payload = { success: true, id, hoanThien: completeness(record) };
        return params.response_format === ResponseFormat.JSON
          ? jsonResult(payload)
          : textResult(`Đã tạo bệnh án \`${id}\` (hoàn thiện ${payload.hoanThien}%).`);
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- record_update ---------------- */
  server.registerTool(
    "record_update",
    {
      title: "Sửa bệnh án",
      description: `Ghi đè một số mục của bệnh án. Chỉ các đường dẫn trong 'fields' bị thay đổi, phần còn lại giữ nguyên.

Args:
  - user_id (string, bắt buộc), record_id (string, bắt buộc)
  - fields (object, bắt buộc): map đường dẫn -> giá trị, vd { "chanDoanXacDinh": "Viêm phổi thùy", "khamBenh.phoi": "Ran nổ đáy phổi phải" }
  - response_format ('markdown' | 'json')

Returns (JSON): { success: true, id, updated: [...], hoanThien, lastUpdated }
Lưu ý: lastUpdated được đặt lại = thời điểm hiện tại nên bản cloud sẽ thắng khi trang đồng bộ.
Nếu người dùng đang mở tab viết bệnh án, tab đó có thể ghi đè lại — nên đóng tab trước khi sửa qua MCP.`,
      inputSchema: UpdateRecordSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: z.infer<typeof UpdateRecordSchema>): Promise<ToolResult> => {
      try {
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.MEDICAL_RECORDS).doc(docIdOf(params.user_id, params.record_id));
        const snap = await ref.get();
        if (!snap.exists) {
          return textResult(`Không tìm thấy bệnh án '${params.record_id}' của UID ${params.user_id}.`, true);
        }

        const record: Rec = snap.data()?.record ?? { id: params.record_id };
        const updated = Object.keys(params.fields);
        for (const [path, value] of Object.entries(params.fields)) setPath(record, path, value);
        record.id = record.id ?? params.record_id;
        record.lastUpdated = new Date().toISOString();

        await ref.set({
          userId: params.user_id,
          recordId: params.record_id,
          lastUpdated: record.lastUpdated,
          record,
        });
        const payload = {
          success: true,
          id: params.record_id,
          updated,
          hoanThien: completeness(record),
          lastUpdated: record.lastUpdated,
        };
        return params.response_format === ResponseFormat.JSON
          ? jsonResult(payload)
          : textResult(
              `Đã cập nhật ${updated.length} mục của bệnh án \`${params.record_id}\`: ${updated.join(", ")}. ` +
                `Hoàn thiện ${payload.hoanThien}%.`,
            );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  /* ---------------- record_delete ---------------- */
  server.registerTool(
    "record_delete",
    {
      title: "Xóa bệnh án",
      description: `Xóa bản cloud của một bệnh án. Bắt buộc confirm=true.

Args:
  - user_id (string, bắt buộc), record_id (string, bắt buộc), confirm (boolean, bắt buộc)

Returns (JSON): { success: true, id, deletedName }
Lưu ý: KHÔNG hoàn tác được. Bản trong localStorage trên máy người dùng vẫn còn và sẽ được đẩy lên lại ở lần đồng bộ sau — muốn xóa hẳn thì xóa trong app.`,
      inputSchema: DeleteRecordSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params: z.infer<typeof DeleteRecordSchema>): Promise<ToolResult> => {
      try {
        if (!params.confirm) return textResult("Chưa xóa: cần truyền confirm=true để xác nhận.", true);
        const db = getFirestore();
        const ref = db.collection(COLLECTIONS.MEDICAL_RECORDS).doc(docIdOf(params.user_id, params.record_id));
        const snap = await ref.get();
        if (!snap.exists) {
          return textResult(`Không tìm thấy bệnh án '${params.record_id}' của UID ${params.user_id}.`, true);
        }
        const name = snap.data()?.record?.hanhChinh?.hoTen ?? "(chưa đặt tên)";
        await ref.delete();
        return jsonResult({ success: true, id: params.record_id, deletedName: name });
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
