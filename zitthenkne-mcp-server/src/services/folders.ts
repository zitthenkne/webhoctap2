/**
 * Cây thư mục (thư mục lồng nhau qua `parentId`) — cùng quy ước với web app
 * (features/quiz/library/library-helpers.js):
 *   - Thư mục trong thùng rác (deleted=true) coi như không tồn tại.
 *   - parentId trỏ tới thư mục không còn / trỏ vào chính nó → thư mục đó nằm ở gốc.
 *   - Bộ đề có folderId trỏ tới thư mục không còn → bộ đề nằm ở gốc.
 * Nhờ vậy agent thấy đúng cây mà người dùng thấy trên web, không có mục nào "mất tích".
 */

import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../constants.js";
import { toQuizFolder } from "./helpers.js";
import type { QuizFolder } from "../types.js";

/** Metadata gọn của bộ đề dùng để đếm / liệt kê trong cây (không kèm câu hỏi). */
export interface QuizBrief {
  id: string;
  title: string;
  questionCount: number;
  folderId: string | null;
}

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  color?: string;
  pinned?: boolean;
  isPublic?: boolean;
  /** Đường dẫn từ gốc, vd "Nội khoa / Tim mạch / Suy tim". */
  path: string;
  /** Cấp: 0 = nằm ngay ở gốc. */
  depth: number;
  /** Số bộ đề nằm TRỰC TIẾP trong thư mục. */
  quizCount: number;
  /** Số bộ đề trong cả cây con (gồm chính nó). */
  totalQuizCount: number;
  /** Tổng số câu trong cả cây con. */
  totalQuestionCount: number;
  /** Số thư mục con trực tiếp (kể cả khi `children` bị cắt bởi max_depth). */
  childCount: number;
  children: FolderNode[];
  quizzes?: QuizBrief[];
}

export const PATH_SEP = " / ";

/** Tải mọi thư mục của một người dùng (mặc định bỏ thư mục trong thùng rác). */
export async function loadUserFolders(
  db: Firestore,
  userId: string,
  includeDeleted = false,
): Promise<QuizFolder[]> {
  const snap = await db.collection(COLLECTIONS.QUIZ_FOLDERS).where("userId", "==", userId).get();
  return snap.docs.map(toQuizFolder).filter((f) => includeDeleted || !f.deleted);
}

/** Tải metadata mọi bộ đề (chưa xóa) của người dùng — chỉ lấy vài trường, không kéo mảng câu hỏi. */
export async function loadUserQuizBriefs(db: Firestore, userId: string): Promise<QuizBrief[]> {
  const snap = await db
    .collection(COLLECTIONS.QUIZ_SETS)
    .where("userId", "==", userId)
    .select("title", "questionCount", "folderId", "deleted")
    .get();
  return snap.docs
    .filter((d) => d.get("deleted") !== true)
    .map((d) => ({
      id: d.id,
      title: d.get("title") ?? "(không tiêu đề)",
      questionCount: typeof d.get("questionCount") === "number" ? d.get("questionCount") : 0,
      folderId: d.get("folderId") ?? null,
    }));
}

/** Bộ chỉ mục cây thư mục dựng từ danh sách phẳng. */
export class FolderIndex {
  readonly byId: Map<string, QuizFolder>;

  constructor(readonly folders: QuizFolder[]) {
    this.byId = new Map(folders.map((f) => [f.id, f]));
  }

  get(id: string | null | undefined): QuizFolder | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  /** Cha hợp lệ (null = gốc). */
  parentOf(f: QuizFolder): string | null {
    const p = f.parentId;
    return p && p !== f.id && this.byId.has(p) ? p : null;
  }

  children(parentId: string | null): QuizFolder[] {
    return sortFolders(this.folders.filter((f) => this.parentOf(f) === parentId));
  }

  /** Chuỗi thư mục từ gốc tới `id` (gồm chính nó). Chặn vòng lặp phòng dữ liệu hỏng. */
  pathOf(id: string): QuizFolder[] {
    const out: QuizFolder[] = [];
    const seen = new Set<string>();
    let f = this.get(id);
    while (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.unshift(f);
      f = this.get(this.parentOf(f));
    }
    return out;
  }

  pathString(id: string): string {
    return this.pathOf(id).map(folderName).join(PATH_SEP);
  }

  /** Mọi thư mục con cháu (không gồm chính nó). */
  descendants(id: string): string[] {
    const out: string[] = [];
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const c of this.children(cur)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c.id);
        queue.push(c.id);
      }
    }
    return out;
  }

  /** Đưa thư mục `id` vào `targetParentId` có hợp lệ không (không vào chính nó / con cháu của nó). */
  canMoveInto(id: string, targetParentId: string | null): boolean {
    if (!targetParentId) return true;
    if (targetParentId === id) return false;
    return !this.descendants(id).includes(targetParentId);
  }

  /** Tìm thư mục con theo tên (không phân biệt hoa thường / khoảng trắng thừa). */
  findChildByName(parentId: string | null, name: string): QuizFolder | undefined {
    const want = normalizeName(name);
    return this.children(parentId).find((f) => normalizeName(folderName(f)) === want);
  }

  /** Thư mục THỰC SỰ chứa bộ đề (null = gốc), giống quizFolderOf của web. */
  quizFolderOf(q: { folderId: string | null }): string | null {
    return q.folderId && this.byId.has(q.folderId) ? q.folderId : null;
  }

  /**
   * Dựng cây lồng nhau bắt đầu từ `rootId` (null = toàn bộ thư viện).
   * maxDepth: số cấp tối đa tính từ điểm bắt đầu (Infinity = không giới hạn).
   */
  buildTree(
    quizzes: QuizBrief[],
    { rootId = null, maxDepth = Infinity, includeQuizzes = false }: {
      rootId?: string | null;
      maxDepth?: number;
      includeQuizzes?: boolean;
    } = {},
  ): FolderNode[] {
    const direct = new Map<string | null, QuizBrief[]>();
    for (const q of quizzes) {
      const fid = this.quizFolderOf(q);
      if (!direct.has(fid)) direct.set(fid, []);
      direct.get(fid)!.push(q);
    }
    const seen = new Set<string>();
    const make = (f: QuizFolder, level: number): FolderNode => {
      seen.add(f.id);
      const own = direct.get(f.id) ?? [];
      const kids = this.children(f.id).filter((c) => !seen.has(c.id));
      const childNodes = kids.map((c) => make(c, level + 1));
      const node: FolderNode = {
        id: f.id,
        name: folderName(f),
        parentId: this.parentOf(f),
        ...(f.icon ? { icon: f.icon } : {}),
        ...(f.color ? { color: f.color } : {}),
        ...(f.pinned ? { pinned: true } : {}),
        ...(f.isPublic ? { isPublic: true } : {}),
        path: this.pathString(f.id),
        depth: this.pathOf(f.id).length - 1,
        quizCount: own.length,
        totalQuizCount: own.length + childNodes.reduce((s, c) => s + c.totalQuizCount, 0),
        totalQuestionCount:
          own.reduce((s, q) => s + q.questionCount, 0) +
          childNodes.reduce((s, c) => s + c.totalQuestionCount, 0),
        childCount: childNodes.length,
        // Quá maxDepth thì vẫn đếm số liệu cây con nhưng không trả các nút con (đỡ tràn context)
        children: level + 1 < maxDepth ? childNodes : [],
      };
      if (includeQuizzes) node.quizzes = own;
      return node;
    };
    const starts = rootId ? [this.get(rootId)].filter((f): f is QuizFolder => !!f) : this.children(null);
    return starts.map((f) => make(f, 0));
  }
}

export function folderName(f: QuizFolder): string {
  return f.name || f.title || "Thư mục";
}

function normalizeName(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Thứ tự giống web: ghim lên đầu → thứ tự kéo-thả → mới nhất trước. */
export function sortFolders(list: QuizFolder[]): QuizFolder[] {
  return [...list].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0);
  });
}

/** Tách đường dẫn "A / B / C" hoặc "A/B/C" hoặc "A > B > C" thành từng tên thư mục. */
export function splitFolderPath(path: string): string[] {
  return path
    .split(/\s*(?:\/|>|›)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Vẽ cây dạng markdown thụt lề. */
export function renderTreeMarkdown(nodes: FolderNode[], indent = ""): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    const stats = [
      n.totalQuizCount ? `${n.totalQuizCount} bộ đề` : "trống",
      n.totalQuestionCount ? `${n.totalQuestionCount} câu` : "",
      n.pinned ? "📌" : "",
      n.isPublic ? "🌐 công khai" : "",
    ].filter(Boolean).join(" · ");
    lines.push(`${indent}- 📁 **${n.name}** (\`${n.id}\`) — ${stats}`);
    for (const q of n.quizzes ?? []) {
      lines.push(`${indent}  - 📄 ${q.title} (\`${q.id}\`) — ${q.questionCount} câu`);
    }
    lines.push(...renderTreeMarkdown(n.children, indent + "  "));
    // Bị cắt bởi max_depth: báo còn thư mục con để agent biết gọi tiếp với root_id
    if (n.children.length < n.childCount) {
      lines.push(`${indent}  - … còn ${n.childCount} thư mục con (gọi lại với root_id="${n.id}")`);
    }
  }
  return lines;
}
