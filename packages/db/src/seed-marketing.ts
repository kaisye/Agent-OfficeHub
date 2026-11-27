/**
 * Second workspace: the VietNote marketing team. One orchestrator (Phong) and five content roles run by
 * apps/agent-runner. They produce publications (posts, emails, scripts, plans), never code.
 * Idempotent: an existing workspace is left untouched (no tokens printed again).
 */
import { randomUUID } from "node:crypto";
import type { MascotBuddy } from "@officehub/shared";
import { adminSql } from "./client.js";
import { AGENT_SCOPES } from "./seed.js";
import { generateAgentToken } from "./tokens.js";

export const MARKETING_SLUG = "vietnote-marketing";

export const MARKETING_ROLES: readonly { key: string; name: string; mission: string; wave: number; buddy: MascotBuddy }[] = [
  {
    key: "leader",
    name: "Trưởng nhóm",
    mission: "Nhận việc từ người điều phối, chia việc cho các vai trò, tổng hợp kết quả thành ấn phẩm hoàn chỉnh.",
    wave: 0,
    buddy: "sage",
  },
  {
    key: "content",
    name: "Nội dung",
    mission: "Bài Facebook, bài nhóm, kịch bản video ngắn, tiêu đề, câu chữ trong app. Giọng của người sáng lập.",
    wave: 1,
    buddy: "milo",
  },
  {
    key: "cx",
    name: "Chăm sóc khách hàng",
    mission: "Email cá nhân, lời chúc dịp lễ, tin nhắn hỗ trợ, quà tặng bất ngờ. Đúng triết lý đồng hành cùng khách hàng.",
    wave: 1,
    buddy: "mocha",
  },
  {
    key: "pricing",
    name: "Định giá",
    mission: "Gói giá, ưu đãi, trang giá. Tính lãi/lỗ mỗi giờ trước mọi đề xuất.",
    wave: 1,
    buddy: "blu",
  },
  {
    key: "review",
    name: "Phản biện",
    mission: "Soát ấn phẩm trước khi tới người điều phối: số liệu, giá trị cốt lõi, giọng văn, chi phí, rủi ro.",
    wave: 2,
    buddy: "fern",
  },
];

export async function seedMarketing() {
  const sql = adminSql();
  const ex = await sql`SELECT id FROM workspaces WHERE slug = ${MARKETING_SLUG}`;
  if (ex[0]) return { skipped: true as const, workspaceId: ex[0].id as string, agentTokens: [] as { key: string; token: string }[] };

  const ws = randomUUID();
  const phong = randomUUID();
  const agentTokens: { key: string; token: string }[] = [];
  await sql.begin(async (tx) => {
    await tx`INSERT INTO workspaces (id, name, slug, connectors) VALUES (${ws}, 'VietNote Marketing', ${MARKETING_SLUG}, '{}'::text[])`;
    await tx`INSERT INTO members (id, workspace_id, display_name, github_login, role, areas, mascot)
      VALUES (${phong}, ${ws}, 'Phong', null, 'admin', '{}'::text[], ${tx.json({ buddy: "blu" } as never)})`;
    const roleIds: string[] = [];
    for (const r of MARKETING_ROLES) {
      const id = randomUUID();
      roleIds.push(id);
      await tx`INSERT INTO roles (id, workspace_id, key, name, mission, owned_paths, handoff_path, wave, mascot)
        VALUES (${id}, ${ws}, ${r.key}, ${r.name}, ${r.mission}, ${[`an-pham/${r.key}/**`]}::text[], null, ${r.wave}, ${tx.json({ buddy: r.buddy } as never)})`;
      await tx`INSERT INTO status_cards (role_id, workspace_id, presence, doing, updated_by)
        VALUES (${id}, ${ws}, 'idle', null, 'human')`;
      const t = generateAgentToken();
      await tx`INSERT INTO agents (id, workspace_id, owner_id, role_id, kind, label, scopes, token_hash, token_prefix)
        VALUES (${randomUUID()}, ${ws}, ${phong}, ${id}, 'other', ${`Runner · ${r.name}`}, ${AGENT_SCOPES}::text[], ${t.hash}, ${t.prefix})`;
      agentTokens.push({ key: r.key, token: t.token });
    }
    await tx`INSERT INTO decisions (workspace_id, title, body, rationale, decided_by_id, role_ids)
      VALUES (${ws}, 'Team marketing chỉ làm ấn phẩm, chưa động vào code',
        'Các vai trò viết bài, email, kịch bản, kế hoạch. Mọi thứ gửi tới khách hàng hoặc đăng công khai đều do người điều phối duyệt và tự đăng.',
        'Bắt đầu nhỏ, kiểm chứng chất lượng trước khi mở rộng.', ${phong}, ${roleIds}::uuid[])`;
  });
  return { skipped: false as const, workspaceId: ws, agentTokens };
}
