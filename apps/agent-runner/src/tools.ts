/**
 * Tools the model may call. Office Hub tools go through MCP with the role's own token (so every hub rule
 * still applies server-side). File tools are sandboxed: read-only knowledge folder, write-only artifacts
 * folder of this role. No shell, no network, no code.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { Hub } from "./hub.js";
import type { ToolSpec } from "./llm.js";

/** Resolve `p` inside `root`; null when it escapes (.., absolute paths, symlink-looking tricks are not followed). */
export function insideRoot(root: string, p: string): string | null {
  const abs = resolve(root, p);
  const rel = relative(resolve(root), abs);
  if (rel === "" || rel.startsWith("..") || rel.split(sep).includes("..") || resolve(rel) === rel) return null;
  return abs;
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "an-pham"
  );
}

export interface ToolContext {
  hub: Hub;
  roleKey: string;
  isLeader: boolean;
  /** when set, send_request may only target these role keys */
  allowTo?: string[];
  knowledgeDir: string;
  artifactsDir: string;
  /** request ids created by send_request during this run */
  created: string[];
  /** receiver role key of each created request (same order) */
  createdTo?: string[];
  /** artifact paths written during this run */
  saved: string[];
}

export function toolSpecs(isLeader: boolean): ToolSpec[] {
  const specs: ToolSpec[] = [
    { name: "read_board", description: "Xem bảng: các vai trò, thẻ trạng thái, yêu cầu đang mở.", parameters: { type: "object", properties: {} } },
    {
      name: "read_decisions",
      description: "Đọc các Quyết định người điều phối đã ghi. Phải tuân theo.",
      parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } } },
    },
    { name: "list_docs", description: "Liệt kê tài liệu tham khảo (chiến lược, truyền thông, bài mẫu, số liệu).", parameters: { type: "object", properties: {} } },
    {
      name: "read_doc",
      description: "Đọc một tài liệu tham khảo theo đường dẫn từ list_docs.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "save_artifact",
      description: "Lưu một ấn phẩm hoàn chỉnh (bài đăng, email, kịch bản...) dạng Markdown vào kho ấn phẩm của vai trò bạn.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, content: { type: "string" } },
        required: ["title", "content"],
      },
    },
  ];
  if (isLeader)
    specs.push({
      name: "send_request",
      description:
        "Giao một phần việc cho vai trò khác. Tạo NHÁP, người điều phối duyệt rồi mới tới nơi. Viết đủ bối cảnh để vai trò đó làm được ngay. " +
        "Dùng kind=question cho việc giao thường (người điều phối có thể bật tự chuyển trả lời), kind=review khi nhờ Phản biện soát.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Khoá vai trò: content | cx | pricing | review" },
          kind: { type: "string", enum: ["question", "review", "handoff", "blocker"] },
          title: { type: "string", maxLength: 200 },
          body: { type: "string", maxLength: 7000 },
        },
        required: ["to", "title", "body"],
      },
    });
  return specs;
}

async function listFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await listFiles(root, p, out);
    else if (/\.(md|txt|json|csv)$/i.test(e.name)) out.push(relative(root, p));
  }
  return out;
}

export async function runTool(ctx: ToolContext, name: string, args: any): Promise<string> {
  switch (name) {
    case "read_board":
      return JSON.stringify(await ctx.hub.call("read_board", {}));
    case "read_decisions":
      return JSON.stringify(await ctx.hub.call("read_decisions", { limit: args?.limit ?? 20 }));
    case "list_docs":
      return JSON.stringify(await listFiles(ctx.knowledgeDir));
    case "read_doc": {
      const p = insideRoot(ctx.knowledgeDir, String(args?.path ?? ""));
      if (!p) return "Lỗi: đường dẫn nằm ngoài thư mục tài liệu.";
      const text = await readFile(p, "utf8").catch(() => null);
      if (text === null) return "Lỗi: không có tài liệu này. Gọi list_docs để xem danh sách.";
      return text.length > 30000 ? `${text.slice(0, 30000)}\n…(cắt bớt)` : text;
    }
    case "save_artifact": {
      const title = String(args?.title ?? "").slice(0, 120);
      const content = String(args?.content ?? "");
      if (!content.trim()) return "Lỗi: nội dung trống.";
      const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const dir = join(ctx.artifactsDir, ctx.roleKey);
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${day}-${slugify(title)}.md`);
      await writeFile(file, `# ${title}\n\n${content}\n`, { mode: 0o644 });
      const rel = relative(ctx.artifactsDir, file);
      if (!ctx.saved.includes(rel)) ctx.saved.push(rel);
      return `Đã lưu: ${relative(ctx.artifactsDir, file)}`;
    }
    case "send_request": {
      if (!ctx.isLeader) return "Lỗi: chỉ Trưởng nhóm được giao việc.";
      if (ctx.allowTo && !ctx.allowTo.includes(String(args?.to))) return `Lỗi: lượt này chỉ được gửi cho ${ctx.allowTo.join(", ")}.`;
      const r = await ctx.hub.call("send_request", {
        to: String(args?.to ?? ""),
        kind: args?.kind ?? "question",
        title: String(args?.title ?? "").slice(0, 200),
        body: String(args?.body ?? "").slice(0, 8000),
      });
      if (r?.requestId) {
        ctx.created.push(r.requestId);
        (ctx.createdTo ??= []).push(String(args?.to));
      }
      return `Đã tạo nháp yêu cầu ${r?.requestId ?? "?"}, chờ người điều phối duyệt. Kết quả sẽ quay về sau; giờ hãy kết thúc lượt này.`;
    }
    default:
      return `Lỗi: không có tool ${name}.`;
  }
}
