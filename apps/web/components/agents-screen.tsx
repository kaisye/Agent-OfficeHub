"use client";

import { useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, Icon, TokenRevealOnce, relativeTimeVi, useToast } from "@officehub/ui";
import { AgentKind, AgentScope, type Agent } from "@officehub/shared";
import { exportEnvLine, hookEnvNote, hookJson, mcpJson } from "@/lib/agent-snippets";
import { errorMessage } from "@/lib/errors";
import { useAgents, useCreateAgent, useRevokeAgent } from "@/lib/hooks";
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
  "board:read": { title: "Xem bảng văn phòng", help: "Đọc thẻ trạng thái, việc và sự kiện. Chữ do người khác viết luôn được đánh dấu chưa xác minh." },
  "inbox:read": { title: "Đọc hộp thư của bạn", help: "Chỉ thấy yêu cầu mà bạn là một bên. Không thấy bản nháp của người khác." },
  "status:write:self": { title: "Cập nhật thẻ của bạn", help: "Đổi dòng 'đang làm gì' và nhánh trên thẻ của bạn. Thẻ hiện nhãn 'Agent cập nhật hộ'." },
  "request:draft": { title: "Soạn nháp yêu cầu và trả lời", help: "Chỉ soạn nháp. Gửi, chấp nhận, hủy luôn là bạn bấm." },
};

export function AgentsScreen() {
  const { slug, me } = useWorkspace();
  const agents = useAgents(slug);
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<{ agent: Agent; token: string } | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);

  const mine = (agents.data ?? []).filter((a) => a.ownerId === me.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-oh-2xl font-bold">Agent của tôi</h1>
          <p className="text-oh-sm text-oh-ink-muted">Agent là trợ lý của bạn: đọc, soạn nháp, báo trạng thái. Không bao giờ tự gửi.</p>
        </div>
        <Button variant="primary" icon="bot" onClick={() => setAdding(true)}>
          Thêm agent
        </Button>
      </div>

      {revealed && <RevealPanel data={revealed} onDone={() => setRevealed(null)} />}

      {!agents.data ? (
        <ListSkeleton rows={2} label="Đang tải agent…" />
      ) : mine.length === 0 ? (
        <EmptyState
          title="Bạn chưa có agent nào"
          mascot={{ species: "bot", palette: "slate", accessory: null, seed: 3 }}
          description="Thêm agent để Claude Code, Codex hay Gemini CLI đọc bảng và soạn nháp giúp bạn."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Thêm agent đầu tiên
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {mine.map((a) => (
            <AgentRow key={a.id} agent={a} onRevoke={() => setRevoking(a)} />
          ))}
        </ul>
      )}

      <AddAgentDialog
        open={adding}
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

function AgentRow({ agent, onRevoke }: { agent: Agent; onRevoke: () => void }) {
  const revoked = !!agent.revokedAt;
  return (
    <Card as="li" aria-label={`Agent ${agent.label}`} className={revoked ? "opacity-75" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-oh-base font-semibold">
            <Icon name="bot" size={16} />
            {agent.label}
            <Badge tone="agent">{KIND_LABEL[agent.kind]}</Badge>
            {revoked && <Badge tone="danger" icon="cancel">Đã thu hồi</Badge>}
          </h2>
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
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Quyền">
        {agent.scopes.map((s) => (
          <li key={s}>
            <Badge title={SCOPE_INFO[s].help}>{SCOPE_INFO[s].title}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AddAgentDialog({ open, onClose, slug, onCreated }: { open: boolean; onClose: () => void; slug: string; onCreated: (r: { agent: Agent; token: string }) => void }) {
  const toast = useToast();
  const create = useCreateAgent(slug);
  const [kind, setKind] = useState<Agent["kind"]>("claude-code");
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>([...AgentScope.options]);
  const [error, setError] = useState<string | null>(null);
  const close = useStableCallback(() => onClose());
  const valid = label.trim().length > 0 && scopes.length > 0;

  const toggle = (s: AgentScope) => setScopes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setError(null);
    create.mutate(
      { kind, label: label.trim(), scopes },
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
      title="Thêm agent"
      description="Cấp đúng quyền cần dùng. Bạn thu hồi được bất cứ lúc nào."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Để sau
          </Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => submit()}>
            Tạo agent và token
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Loại agent">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Agent["kind"])}>
              {AgentKind.options.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tên gọi" hint="Ví dụ: Claude Code trên laptop.">
          {(id, d) => <TextInput id={id} aria-describedby={d} data-autofocus maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-oh-sm font-medium">Agent được làm gì</legend>
          <ul className="space-y-2">
            {AgentScope.options.map((s) => (
              <li key={s}>
                <label className="flex cursor-pointer items-start gap-3 rounded-oh-md border border-oh-border bg-oh-surface p-3 has-[:checked]:border-oh-agent has-[:checked]:bg-oh-agent-soft">
                  <input type="checkbox" className="mt-1 size-4" checked={scopes.includes(s)} onChange={() => toggle(s)} />
                  <span>
                    <span className="block text-oh-sm font-medium">{SCOPE_INFO[s].title}</span>
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
          Tạo agent
        </button>
      </form>
    </Dialog>
  );
}

function RevealPanel({ data, onDone }: { data: { agent: Agent; token: string }; onDone: () => void }) {
  return (
    <section aria-label="Token mới" className="space-y-4">
      <TokenRevealOnce token={data.token} agentLabel={data.agent.label} onDone={onDone} />
      <Card className="space-y-4">
        <h2 className="text-oh-lg font-semibold">Nối vào Claude Code</h2>
        <p className="text-oh-sm text-oh-ink-muted">Token chỉ hiện lúc này. Đặt nó vào biến môi trường, đừng ghi vào file trong repo.</p>
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

function RevokeDialog({ agent, slug, onClose }: { agent: Agent | null; slug: string; onClose: () => void }) {
  const toast = useToast();
  const revoke = useRevokeAgent(slug);
  const close = useStableCallback(() => onClose());
  return (
    <Dialog
      open={!!agent}
      onClose={close}
      title={agent ? `Thu hồi ${agent.label}?` : "Thu hồi agent"}
      description="Agent mất quyền ngay, token không dùng lại được. Bản nháp đã soạn vẫn còn. Không hoàn tác được."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Giữ lại
          </Button>
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
