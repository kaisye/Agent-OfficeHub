/**
 * Roles (v0.6): the default seats of a software build, taken from docs/ARCHITECTURE.md "Directory ownership",
 * and the path → owner lookup behind the check_paths MCP tool and the board's out-of-area warnings.
 */
import type { MascotBuddy, Role } from "./domain.js";

export interface RoleSeed {
  key: string;
  name: string;
  mission: string;
  ownedPaths: string[];
  handoffPath: string | null;
  wave: number;
  buddy: MascotBuddy;
}

export const DEFAULT_ROLES: readonly RoleSeed[] = [
  {
    key: "leader",
    name: "Leader",
    mission: "Giữ contract chung (packages/shared), chốt kiến trúc, duyệt mọi yêu cầu đổi contract.",
    ownedPaths: ["packages/shared/**", "package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "docker-compose.yml", "docs/ARCHITECTURE.md", "docs/proposal.md", "docs/redesign-orchestrator.md"],
    handoffPath: "docs/ARCHITECTURE.md",
    wave: 0,
    buddy: "sage",
  },
  {
    key: "business",
    name: "Business",
    mission: "PRD, user story, ma trận quyền, luồng yêu cầu và dữ liệu seed.",
    ownedPaths: ["docs/business/**"],
    handoffPath: "docs/business/HANDOFF.md",
    wave: 1,
    buddy: "mocha",
  },
  {
    key: "design",
    name: "Design",
    mission: "Token thương hiệu, linh vật và bộ UI kit.",
    ownedPaths: ["packages/brand/**", "packages/ui/**", "docs/design/**"],
    handoffPath: "docs/design/HANDOFF.md",
    wave: 1,
    buddy: "pip",
  },
  {
    key: "backend",
    name: "Backend",
    mission: "Database, API, MCP server, hook cho agent và triển khai.",
    ownedPaths: ["packages/db/**", "apps/api/**", "apps/mcp/**", "apps/agent-hooks/**", "docs/tech/**", "deploy/**"],
    handoffPath: "docs/tech/HANDOFF.md",
    wave: 1,
    buddy: "blu",
  },
  {
    key: "frontend",
    name: "Frontend",
    mission: "Web app Next.js: bảng, hàng chờ duyệt, màn yêu cầu và quyết định.",
    ownedPaths: ["apps/web/**", "packages/ui-data/**"],
    handoffPath: "apps/web/HANDOFF.md",
    wave: 2,
    buddy: "milo",
  },
  {
    key: "qa",
    name: "QA & Security",
    mission: "Test E2E, kiểm bảo mật (prompt injection, secret, phân quyền), báo cáo chất lượng.",
    ownedPaths: ["tests/e2e/**", "docs/qa/**"],
    handoffPath: "docs/qa/REPORT.md",
    wave: 3,
    buddy: "fern",
  },
];

/** Glob → RegExp. `**` matches any depth (including none), `*` one path segment, `?` one char. */
export function globToRegExp(glob: string): RegExp {
  // "dir/**" also matches "dir" itself
  if (glob.endsWith("/**")) return new RegExp(`${globToRegExp(glob.slice(0, -3)).source.slice(0, -1)}(?:/.*)?$`);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const normalize = (p: string) => p.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");

/** Most specific owner of a repo path (longest matching glob wins), or null when nobody owns it. */
export function ownerOfPath<R extends Pick<Role, "id" | "key" | "ownedPaths">>(path: string, roles: readonly R[]): R | null {
  const p = normalize(path);
  let best: { role: R; score: number } | null = null;
  for (const role of roles)
    for (const g of role.ownedPaths) {
      if (!globToRegExp(normalize(g)).test(p)) continue;
      const score = g.replace(/\*/g, "").length;
      if (!best || score > best.score) best = { role, score };
    }
  return best?.role ?? null;
}

/** Paths a role touches that belong to someone else (or to nobody). Used for the board warning. */
export function outOfArea<R extends Pick<Role, "id" | "key" | "ownedPaths">>(
  role: R,
  paths: readonly string[],
  roles: readonly R[],
): { path: string; owner: R | null }[] {
  return paths
    .map((path) => ({ path, owner: ownerOfPath(path, roles) }))
    .filter((x) => x.owner?.id !== role.id);
}
