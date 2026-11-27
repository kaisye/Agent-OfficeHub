"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, Icon, Mascot, TokenRevealOnce, relativeTimeVi, useToast } from "@officehub/ui";
import { AgentKind, AgentScope, type Agent, type Role } from "@officehub/shared";
import { MCP_URL } from "@/lib/api";
import { exportEnvLine, hookEnvNote, hookJson, mcpJson } from "@/lib/agent-snippets";
import { errorMessage } from "@/lib/errors";
import { useAgents, useBoard, useCreateAgent, useRevokeAgent } from "@/lib/hooks";
import { useStableCallback } from "@/lib/use-stable";
import { Field, Select, TextInput } from "./form";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

export const KIND_LABEL: Record<Agent["kind"], string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  other: "Agent khác",
};

export const SCOPE_INFO: Record<AgentScope, { title: string; help: string }> = {
  "board:read": { title: "Xem bảng văn phòng", help: "Đọc thẻ vai trò, việc, sự kiện, và hỏi file thuộc vùng ai (check_paths). Chữ của vai trò khác luôn mang nhãn chưa xác minh." },
  "inbox:read": { title: "Đọc hộp thư của vai trò", help: "Chỉ thấy yêu cầu vai trò này là một bên, sau khi bạn đã chuyển. Không thấy nháp của vai trò khác." },
  "status:write:self": { title: "Cập nhật thẻ của vai trò", help: "Đổi trạng thái, đang làm gì, nhánh và file đang sửa trên thẻ của chính vai trò này." },
  "request:draft": { title: "Soạn nháp yêu cầu và trả lời", help: "Chỉ soạn nháp. Chuyển, đóng, hủy luôn là bạn bấm." },
  "decision:read": { title: "Đọc sổ quyết định", help: "Đọc quyết định đã ghi, ưu tiên những cái gắn với vai trò này." },
  "decision:propose": { title: "Đề xuất quyết định", help: "Đề xuất vào hàng chờ duyệt. Chỉ bạn ghi thành quyết định." },
};

/** Agents: one token per agent session, each holding a role. Grouped by role. */
export function AgentsScreen() {
  const { slug } = useWorkspace();
  const agents = useAgents(slug);
  const board = useBoard(slug);
  const [adding, setAdding] = useState<string | null | false>(false);
  const [revealed, setRevealed] = useState<{ agent: Agent; token: string } | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const roles = board.data?.roles ?? [];

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-oh-2xl font-bold">Agent</h1>
          <p className="text-oh-sm text-oh-ink-muted">Mỗi phiên agent một token, gắn với một vai trò. Agent đọc, soạn nháp, báo trạng thái. Không bao giờ tự chuyển.</p>
        </div>
        <Button variant="primary" icon="key" onClick={() => setAdding(null)}>
          Tạo token
        </Button>
      </div>

      {revealed && <RevealPanel data={revealed} role={roles.find((r) => r.id === revealed.agent.roleId)} onDone={() => setRevealed(null)} />}

      {!agents.data || !board.data ? (
        <ListSkeleton rows={3} label="Đang tải agent…" />
      ) : (
        <div className="space-y-6">
          {roles.map((r) => {
            const list = agents.data.filter((a) => a.roleId === r.id);
            return (
              <section key={r.id} aria-labelledby={`ag-${r.id}`} className="space-y-2">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`ag-${r.id}`} className="flex items-center gap-2 text-oh-lg font-semibold">
                    <Mascot mascot={r.mascot} mood="relaxed" size={32} decorative noBadge />
                    {r.name}
                    <Badge>{list.filter((a) => !a.revokedAt).length} đang dùng</Badge>
                  </h2>
                  <Button size="sm" variant="secondary" icon="plus" onClick={() => setAdding(r.id)} aria-label={`Tạo token cho ${r.name}`}>
                    Tạo token
                  </Button>
                </header>
                {list.length === 0 ? (
                  <p className="rounded-oh-md border border-dashed border-oh-border-strong px-3 py-4 text-center text-oh-xs text-oh-ink-muted">Chưa có agent nào giữ vai trò này.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((a) => (
                      <AgentRow key={a.id} agent={a} onRevoke={() => setRevoking(a)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {roles.length === 0 && <EmptyState title="Chưa có vai trò nào" mood="curious" description="Workspace cần các vai trò trước khi tạo token." />}
        </div>
      )}

      <AddAgentDialog
        open={adding !== false}
        roles={roles}
        defaultRoleId={adding || null}
        onClose={() => setAdding(false)}
        slug={slug}
        onCreated={(r) => {
          setAdding(false);
          setRevealed(r);
        }}
      />
      <RevokeDialog agent={revoking} slug={slug} onClose={() => setRevoking(null)} />
    </div>
  );
}

export function AgentRow({ agent, onRevoke, compact }: { agent: Agent; onRevoke: () => void; compact?: boolean }) {
  const revoked = !!agent.revokedAt;
  return (
    <Card as="li" aria-label={`Agent ${agent.label}`} className={revoked ? "opacity-70" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-oh-base font-semibold">
            <Icon name="bot" size={16} />
            {agent.label}
            <Badge tone="agent">{KIND_LABEL[agent.kind]}</Badge>
            {revoked && <Badge tone="danger" icon="cancel">Đã thu hồi</Badge>}
          </h3>
          <p className="mt-1 font-mono text-oh-xs text-oh-ink-muted">oh_agent_{agent.tokenPrefix}…</p>
          <p className="mt-1 text-oh-xs text-oh-ink-muted">
            {revoked ? `Thu hồi ${relativeTimeVi(agent.revokedAt!)}` : agent.lastSeenAt ? `Hoạt động lần cuối ${relativeTimeVi(agent.lastSeenAt)}` : "Chưa thấy hoạt động"}
          </p>
        </div>
        {!revoked && (
          <Button variant="secondary" size="sm" icon="cancel" onClick={onRevoke} aria-label={`Thu hồi ${agent.label}`}>
            Thu hồi
          </Button>
        )}
      </div>
      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Quyền">
          {agent.scopes.map((s) => (
            <li key={s}>
              <Badge title={SCOPE_INFO[s].help}>{SCOPE_INFO[s].title}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AddAgentDialog({
  open,
  onClose,
  slug,
  roles,
  defaultRoleId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  roles: Role[];
  defaultRoleId: string | null;
  onCreated: (r: { agent: Agent; token: string }) => void;
}) {
  const toast = useToast();
  const create = useCreateAgent(slug);
  const [roleId, setRoleId] = useState<string>(defaultRoleId ?? "");
  const [kind, setKind] = useState<Agent["kind"]>("claude-code");
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>([...AgentScope.options]);
  const [error, setError] = useState<string | null>(null);
  const close = useStableCallback(() => onClose());
  useEffect(() => {
    if (open) {
      setRoleId(defaultRoleId ?? "");
      setError(null);
    }
  }, [open, defaultRoleId]);
  const role = roles.find((r) => r.id === roleId);
  const name = label.trim() || (role ? `${KIND_LABEL[kind]} · ${role.name}` : "");
  const valid = !!role && name.length > 0 && scopes.length > 0;

  const toggle = (s: AgentScope) => setScopes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setError(null);
    create.mutate(
      { roleId, kind, label: name.slice(0, 60), scopes },
      {
        onSuccess: (r) => {
          setLabel("");
          onCreated(r);
        },
        onError: (err) => {
          setError(errorMessage(err));
          toast(errorMessage(err), "danger");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={role ? `Tạo token cho ${role.name}` : "Tạo token agent"}
      description="Agent nói thay cho vai trò này. Cấp đúng quyền cần dùng; thu hồi được bất cứ lúc nào."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Để sau</Button>
          <Button variant="primary" icon="key" disabled={!valid} loading={create.isPending} onClick={() => submit()}>
            Tạo token
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Vai trò">
          {(id) => (
            <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)} data-autofocus={!defaultRoleId || undefined}>
              <option value="" disabled>Chọn vai trò…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loại agent">
            {(id) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Agent["kind"])}>
                {AgentKind.options.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tên gọi" hint="Để trống: tự đặt theo loại và vai trò.">
            {(id, d) => <TextInput id={id} aria-describedby={d} data-autofocus={defaultRoleId ? true : undefined} maxLength={60} value={label} placeholder={name} onChange={(e) => setLabel(e.target.value)} />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-oh-sm font-medium">Agent được làm gì</legend>
          <ul className="space-y-2">
            {AgentScope.options.map((s) => (
              <li key={s}>
                <label className="flex cursor-pointer items-start gap-3 rounded-oh-md border border-oh-border bg-oh-surface p-3 has-[:checked]:border-oh-agent has-[:checked]:bg-oh-agent-soft">
                  <input type="checkbox" className="mt-1 size-4" checked={scopes.includes(s)} onChange={() => toggle(s)} />
                  <span>
                    <span className="block text-oh-sm font-medium">{SCOPE_INFO[s].title} <code className="ml-1 text-[11px] font-normal text-oh-ink-muted">{s}</code></span>
                    <span className="block text-oh-xs text-oh-ink-muted">{SCOPE_INFO[s].help}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {scopes.length === 0 && <p className="mt-1 text-oh-xs text-oh-danger-soft-fg">Chọn ít nhất một quyền.</p>}
        </fieldset>
        {error && (
          <p role="alert" className="text-oh-sm text-oh-danger-soft-fg">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          Tạo token
        </button>
      </form>
    </Dialog>
  );
}

export function RevealPanel({ data, role, onDone }: { data: { agent: Agent; token: string }; role?: Role; onDone: () => void }) {
  return (
    <section aria-label="Token mới" className="space-y-4">
      <TokenRevealOnce token={data.token} agentLabel={data.agent.label} onDone={onDone} />
      <Card className="space-y-4">
        <h2 className="text-oh-lg font-semibold">Nối vào Claude Code{role ? ` (vai trò ${role.name})` : ""}</h2>
        <p className="text-oh-sm text-oh-ink-muted">
          Token chỉ hiện lúc này. Đặt nó vào biến môi trường, đừng ghi vào file trong repo. MCP: <code className="font-mono">{MCP_URL}</code>
        </p>
        <CodeBlock title="1. Đặt token vào môi trường (terminal)" text={exportEnvLine(data.token)} />
        <CodeBlock title="2. .mcp.json (đặt ở thư mục dự án)" text={mcpJson()} note="Claude Code tự thay ${OFFICEHUB_AGENT_TOKEN} bằng biến môi trường ở bước 1." />
        <CodeBlock title="3. Hook chèn yêu cầu chưa đọc khi mở phiên và mỗi lần bạn gõ (.claude/settings.json)" text={hookJson()} note={hookEnvNote} />
      </Card>
    </section>
  );
}

function CodeBlock({ title, text, note }: { title: string; text: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-oh-sm font-medium">{title}</h3>
        <Button size="sm" variant="secondary" icon={copied ? "check" : "copy"} onClick={copy}>
          {copied ? "Đã chép" : "Sao chép"}
        </Button>
      </div>
      <pre tabIndex={0} aria-label={title} className="overflow-x-auto whitespace-pre-wrap break-all rounded-oh-md bg-oh-surface-2 p-3 font-mono text-oh-xs leading-relaxed text-oh-ink focus-visible:outline-3 focus-visible:outline-oh-focus">
        {text}
      </pre>
      {note && <p className="text-oh-xs text-oh-ink-muted">{note}</p>}
    </div>
  );
}

export function RevokeDialog({ agent, slug, onClose }: { agent: Agent | null; slug: string; onClose: () => void }) {
  const toast = useToast();
  const revoke = useRevokeAgent(slug);
  const close = useStableCallback(() => onClose());
  return (
    <Dialog
      open={!!agent}
      onClose={close}
      title={agent ? `Thu hồi ${agent.label}?` : "Thu hồi agent"}
      description="Agent mất quyền ngay, token không dùng lại được. Nháp đã soạn vẫn còn trong hàng chờ. Không hoàn tác được."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Giữ lại</Button>
          <Button
            variant="danger"
            data-autofocus
            loading={revoke.isPending}
            onClick={() =>
              agent &&
              revoke.mutate(agent.id, {
                onSuccess: () => {
                  toast(`Đã thu hồi ${agent.label}.`, "success");
                  close();
                },
                onError: (e) => toast(errorMessage(e), "danger"),
              })
            }
          >
            Thu hồi
          </Button>
        </>
      }
    />
  );
}
