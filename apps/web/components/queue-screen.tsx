"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { canAutoForward, type DecisionProposal, type Member, type Request, type Role } from "@officehub/shared";
import { Badge, Button, Dialog, EmptyState, Icon, cn, relativeTimeVi, useToast } from "@officehub/ui";
import { errorMessage } from "@/lib/errors";
import { useActOnProposal, useActOnRequest, useBoard, useQueue } from "@/lib/hooks";
import { draftOf, isOverdue, lastQuestion, lastReply, partyOf, queueSection, roleMap, type QueueSection } from "@/lib/requests";
import { useStableCallback } from "@/lib/use-stable";
import { TextArea, TextInput } from "./form";
import { NewRequestDialog } from "./new-request-dialog";
import { AuthorLabel, KindChip, MessageText, PartyRoute, RoleChips } from "./parties";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

const SECTIONS: { id: QueueSection; title: string; hint: string; icon: "draft" | "reply" | "request" | "check" }[] = [
  { id: "drafts", title: "Nháp cần chuyển", hint: "Agent đã soạn. Không gì tới vai trò kia khi bạn chưa bấm Chuyển.", icon: "draft" },
  { id: "replies", title: "Câu trả lời chờ chuyển", hint: "Vai trò nhận đã soạn trả lời. Duyệt rồi chuyển về bên hỏi.", icon: "reply" },
  { id: "askingMe", title: "Agent hỏi bạn", hint: "Câu hỏi gửi thẳng cho bạn. Bạn trả lời, agent nhận được ngay.", icon: "request" },
  { id: "answered", title: "Đã có trả lời", hint: "Bên hỏi đã nhận trả lời. Đóng nếu đủ, hoặc hỏi lại.", icon: "check" },
];

/** "Chờ duyệt": everything waiting for the orchestrator's click, blockers first. The landing screen. */
export function QueueScreen() {
  const { slug, me } = useWorkspace();
  const queue = useQueue(slug);
  const board = useBoard(slug);
  const [assigning, setAssigning] = useState(false);

  if (queue.isError || board.isError) {
    return (
      <EmptyState
        title="Chưa tải được hàng chờ"
        mood="worried"
        description="Chưa kết nối được. Thử lại sau nhé."
        action={<Button onClick={() => void Promise.all([queue.refetch(), board.refetch()])}>Thử lại</Button>}
      />
    );
  }
  if (!queue.data || !board.data) return <ListSkeleton label="Đang tải hàng chờ…" />;
  const roles = roleMap(board.data.roles);
  const orchestrator = board.data.orchestrator;
  const reqs = queue.data.requests;
  const proposals = queue.data.proposals;
  const blockers = reqs.filter((r) => r.kind === "blocker");
  const total = reqs.length + proposals.length;
  // Blockers first inside each section, then the server's order (oldest first).
  const bySection = (s: QueueSection) =>
    reqs.filter((r) => queueSection(r) === s).sort((a, b) => Number(b.kind === "blocker") - Number(a.kind === "blocker"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] text-oh-ink-muted">
            <Icon name="shield" size={13} />
            BẠN LÀ CỔNG DUYỆT
          </p>
          <h1 className="text-oh-3xl font-bold tracking-tight">Chờ duyệt</h1>
          <p className="mt-1 text-oh-sm text-oh-ink-muted">Agent soạn, bạn chuyển. Tin giữa các vai trò chỉ đi khi bạn bấm.</p>
        </div>
        <Button variant="primary" icon="request" onClick={() => setAssigning(true)}>
          Giao việc
        </Button>
      </div>

      <nav aria-label="Các mục chờ duyệt" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <JumpChip key={s.id} href={`#q-${s.id}`} label={s.title} n={bySection(s.id).length} />
        ))}
        <JumpChip href="#q-proposals" label="Đề xuất quyết định" n={proposals.length} />
      </nav>

      {blockers.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-oh-lg border border-oh-danger bg-oh-danger-soft p-3.5 text-oh-danger-soft-fg">
          <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0 text-oh-sm">
            <p className="font-semibold">{blockers.length} việc đang kẹt cần bạn trước</p>
            <ul className="mt-1 space-y-0.5">
              {blockers.map((r) => (
                <li key={r.id} className="truncate">
                  <a href={`#req-${r.id}`} className="underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">
                    {partyOf(r.askerRoleId, roles, orchestrator).displayName}: {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {total === 0 ? (
        <EmptyState title="Không có gì chờ bạn" mascot={me.mascot} mood="relaxed" description="Các agent chưa soạn gì mới. Xem bản đồ văn phòng để biết ai đang làm gì." action={<Link href={`/w/${slug}/office`} className="rounded-oh-md bg-oh-primary px-4 py-2 text-oh-primary-fg">Mở văn phòng</Link>} />
      ) : (
        <>
          {SECTIONS.map((s) => (
            <Section key={s.id} id={`q-${s.id}`} title={s.title} hint={s.hint} icon={s.icon} n={bySection(s.id).length}>
              {bySection(s.id).map((r) => (
                <li key={r.id}>
                  <QueueRequest request={r} section={s.id} roles={roles} orchestrator={orchestrator} slug={slug} />
                </li>
              ))}
            </Section>
          ))}
          <Section id="q-proposals" title="Đề xuất quyết định" hint="Agent đề xuất, chỉ bạn ghi thành quyết định. Sửa trước khi ghi nếu cần." icon="decision" n={proposals.length}>
            {proposals.map((p) => (
              <li key={p.id}>
                <ProposalCard proposal={p} roles={board.data.roles} slug={slug} />
              </li>
            ))}
          </Section>
        </>
      )}

      <NewRequestDialog open={assigning} onClose={() => setAssigning(false)} slug={slug} roles={board.data.roles} tasks={board.data.tasks} />
    </div>
  );
}

function JumpChip({ href, label, n }: { href: string; label: string; n: number }) {
  return (
    <a href={href} className={cn("inline-flex items-center gap-1.5 rounded-oh-full border px-3 py-1 text-oh-xs font-medium focus-visible:outline-3 focus-visible:outline-oh-focus", n ? "border-oh-border-strong bg-oh-surface text-oh-ink hover:bg-oh-surface-2" : "border-oh-border text-oh-ink-muted")}>
      {label}
      <span className={cn("rounded-oh-full px-1.5 text-[11px]", n ? "bg-oh-primary text-oh-primary-fg" : "bg-oh-surface-2")}>{n}</span>
    </a>
  );
}

function Section({ id, title, hint, icon, n, children }: { id: string; title: string; hint: string; icon: "draft" | "reply" | "request" | "check" | "decision"; n: number; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <header className="mb-2.5 flex items-center gap-2">
        <Icon name={icon} size={16} className="text-oh-ink-muted" />
        <h2 id={`${id}-h`} className="text-oh-lg font-semibold">{title}</h2>
        <Badge tone={n ? "human" : "neutral"}>{n}</Badge>
      </header>
      <p className="-mt-1.5 mb-3 text-oh-xs text-oh-ink-muted">{hint}</p>
      {n === 0 ? <p className="rounded-oh-md border border-dashed border-oh-border-strong px-3 py-4 text-center text-oh-xs text-oh-ink-muted">Trống</p> : <ul className="space-y-3">{children}</ul>}
    </section>
  );
}

/* ---------------------------------------------------------------- one request in the queue */

function QueueRequest({ request: r, section, roles, orchestrator, slug }: { request: Request; section: QueueSection; roles: Map<string, Role>; orchestrator: Member; slug: string }) {
  const toast = useToast();
  const act = useActOnRequest(slug);
  const asker = partyOf(r.askerRoleId, roles, orchestrator);
  const receiver = partyOf(r.receiverRoleId, roles, orchestrator);
  const ask = draftOf(r, "ask");
  const reply = draftOf(r, "reply");
  const question = lastQuestion(r);
  const answer = lastReply(r);
  const [text, setText] = useState(section === "drafts" ? (ask?.body ?? "") : section === "replies" ? (reply?.body ?? "") : "");
  const [answerNow, setAnswerNow] = useState("");
  const [auto, setAuto] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const blocker = r.kind === "blocker";
  const toMe = r.receiverRoleId === null;
  const busy = act.isPending;

  const run = (action: Parameters<typeof act.mutate>[0]["action"], opts: { body?: string; autoForwardReply?: boolean } = {}, done?: string) =>
    new Promise<boolean>((resolve) =>
      act.mutate(
        { id: r.id, action, ...opts },
        {
          onSuccess: () => {
            if (done) toast(done, "success");
            resolve(true);
          },
          onError: (e) => {
            toast(errorMessage(e), "danger");
            resolve(false);
          },
        },
      ),
    );
  const changed = (orig: string | undefined) => (text.trim() && text.trim() !== orig ? text.trim() : undefined);

  const forward = () => run("send", { body: changed(ask?.body), autoForwardReply: auto || undefined }, `Đã chuyển cho ${toMe ? "bạn" : receiver.displayName}.`);
  const replyNow = async () => {
    // Flow C in one go: forward the agent's question to yourself, then answer it.
    if (await run("send")) await run("send_reply", { body: answerNow.trim() }, `Đã trả lời ${asker.displayName}.`);
  };

  return (
    <article
      id={`req-${r.id}`}
      aria-label={`${blocker ? "Đang kẹt: " : ""}${r.title}`}
      data-kind={r.kind}
      className={cn("scroll-mt-20 rounded-oh-lg border bg-oh-surface p-4 shadow-oh-sm", blocker ? "border-oh-danger ring-1 ring-oh-danger" : "border-oh-border")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <PartyRoute request={r} roles={roles} orchestrator={orchestrator} />
        <span className="flex flex-wrap items-center gap-1.5">
          {r.unreadForViewer && <span role="img" aria-label="Mới" className="size-2 rounded-oh-full bg-oh-primary" />}
          <KindChip kind={r.kind} />
          {isOverdue(r) && <Badge tone="danger" icon="alert">Quá hạn</Badge>}
          <time dateTime={r.updatedAt} className="text-oh-xs text-oh-ink-muted">{relativeTimeVi(r.updatedAt)}</time>
        </span>
      </header>
      <h3 className="mt-2 text-oh-base font-semibold">
        <Link href={`/w/${slug}/requests/${r.id}`} className="underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-oh-focus">{r.title}</Link>
      </h3>

      <div className="mt-3 space-y-3">
        {section === "drafts" && ask && !toMe && (
          <>
            <AgentDraftEditor id={`d-${r.id}`} author={asker} label={`Nháp gửi ${receiver.displayName}`} value={text} onChange={setText} edited={!!changed(ask.body)} />
            {canAutoForward(r.kind) && (
              <label className="flex items-start gap-2 text-oh-sm">
                <input type="checkbox" className="mt-0.5 size-4" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>
                  Tự chuyển câu trả lời
                  <small className="block text-oh-xs text-oh-ink-muted">Trả lời của {receiver.displayName} về thẳng {asker.displayName}, không cần bạn duyệt lần hai. Vẫn quét secret.</small>
                </span>
              </label>
            )}
            <Actions>
              <Button variant="primary" icon="send" disabled={busy || !text.trim()} onClick={() => void forward()}>Chuyển</Button>
              <Button variant="ghost" icon="cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Hủy</Button>
            </Actions>
          </>
        )}

        {section === "drafts" && ask && toMe && (
          <>
            <MessageText m={ask} request={r} roles={roles} orchestrator={orchestrator} />
            <ReplyBox id={`now-${r.id}`} label={`Trả lời ${asker.displayName}`} value={answerNow} onChange={setAnswerNow} />
            <Actions>
              <Button variant="primary" icon="reply" disabled={busy || !answerNow.trim()} onClick={() => void replyNow()}>Trả lời luôn</Button>
              <Button variant="ghost" icon="cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Hủy</Button>
            </Actions>
          </>
        )}

        {section === "replies" && (
          <>
            {question && <MessageText m={question} request={r} roles={roles} orchestrator={orchestrator} />}
            {reply && <AgentDraftEditor id={`r-${r.id}`} author={partyOf(reply.authoredBy === "human" ? null : r.receiverRoleId, roles, orchestrator)} label={`Trả lời gửi ${asker.human ? "bạn" : asker.displayName}`} value={text} onChange={setText} edited={!!changed(reply.body)} />}
            <Actions>
              <Button variant="primary" icon="send" disabled={busy || !text.trim()} onClick={() => void run("send_reply", { body: changed(reply?.body) }, `Đã chuyển trả lời cho ${asker.human ? "bạn" : asker.displayName}.`)}>Chuyển trả lời</Button>
              <Button variant="ghost" icon="cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Hủy</Button>
            </Actions>
          </>
        )}

        {section === "askingMe" && (
          <>
            {question && <MessageText m={question} request={r} roles={roles} orchestrator={orchestrator} />}
            <ReplyBox id={`a-${r.id}`} label={`Trả lời ${asker.displayName}`} value={text} onChange={setText} />
            <Actions>
              <Button variant="primary" icon="reply" disabled={busy || !text.trim()} onClick={() => void run("send_reply", { body: text.trim() }, `Đã trả lời ${asker.displayName}.`)}>Trả lời</Button>
            </Actions>
          </>
        )}

        {section === "answered" && (
          <>
            {question && <MessageText m={question} request={r} roles={roles} orchestrator={orchestrator} className="opacity-80" />}
            {answer && <MessageText m={answer} request={r} roles={roles} orchestrator={orchestrator} />}
            {r.autoForwardReply && <p className="text-oh-xs text-oh-ink-muted">Trả lời được tự chuyển (bạn đã duyệt trước khi chuyển câu hỏi).</p>}
            {followUp !== null ? (
              <>
                <ReplyBox id={`f-${r.id}`} label={`Hỏi lại ${receiver.displayName}`} value={followUp} onChange={setFollowUp} />
                <Actions>
                  <Button variant="secondary" icon="reply" disabled={busy || !followUp.trim()} onClick={() => void run("follow_up", { body: followUp.trim() }, `Đã hỏi lại ${receiver.displayName}.`).then((ok) => ok && setFollowUp(null))}>Gửi câu hỏi lại</Button>
                  <Button variant="ghost" onClick={() => setFollowUp(null)}>Để sau</Button>
                </Actions>
              </>
            ) : (
              <Actions>
                <Button variant="primary" icon="check" disabled={busy} onClick={() => void run("accept", {}, "Đã đóng yêu cầu.")}>Đóng</Button>
                <Button variant="secondary" icon="reply" disabled={busy} onClick={() => setFollowUp("")}>Hỏi lại</Button>
              </Actions>
            )}
          </>
        )}
      </div>

      <ConfirmCancel
        open={confirmCancel}
        title={r.title}
        busy={busy}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => void run("cancel", {}, "Đã hủy yêu cầu.").then(() => setConfirmCancel(false))}
      />
    </article>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}

/** Editable agent draft. The dashed agent frame and label make clear the text came from an agent: data, not orders. */
function AgentDraftEditor({ id, author, label, value, onChange, edited }: { id: string; author: ReturnType<typeof partyOf>; label: string; value: string; onChange: (v: string) => void; edited: boolean }) {
  return (
    <div data-trust={author.human ? "orchestrator" : "agent-draft"} className={cn("space-y-2 rounded-oh-lg border-2 border-dashed p-3", author.human ? "border-oh-border-strong" : "border-oh-agent bg-oh-agent-soft")}>
      <AuthorLabel party={author} extra={<span>· {edited ? "bạn đã sửa" : "chưa chuyển"}</span>} />
      <label htmlFor={id} className="block text-oh-xs font-medium text-oh-ink-muted">
        {label}
        {!author.human && " · nội dung do agent viết, chưa xác minh. Sửa nếu cần trước khi chuyển."}
      </label>
      <TextArea id={id} rows={4} maxLength={8000} value={value} onChange={(e) => onChange(e.target.value)} className="bg-oh-surface" />
    </div>
  );
}

function ReplyBox({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-oh-sm font-medium">{label}</label>
      <TextArea id={id} rows={3} maxLength={8000} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-oh-xs text-oh-ink-muted">Không dán khóa bí mật (API key, token) vào đây.</p>
    </div>
  );
}

function ConfirmCancel({ open, title, busy, onClose, onConfirm }: { open: boolean; title: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const close = useStableCallback(onClose);
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Hủy yêu cầu này?"
      description={`“${title}” sẽ dừng lại. Agent hai bên thấy yêu cầu đã hủy. Không hoàn tác được.`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Giữ lại</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm} data-autofocus>Hủy yêu cầu</Button>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- decision proposal */

/** An agent's proposal: editable, then "Ghi quyết định" (accept) or "Từ chối" (reject). Only the human records. */
export function ProposalCard({ proposal: p, roles, slug }: { proposal: DecisionProposal; roles: Role[]; slug: string }) {
  const toast = useToast();
  const act = useActOnProposal(slug);
  const byId = roleMap(roles);
  const role = byId.get(p.roleId);
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [rationale, setRationale] = useState(p.rationale);
  const [roleIds, setRoleIds] = useState<string[]>([p.roleId]);
  const [rejecting, setRejecting] = useState(false);
  const valid = title.trim() && rationale.trim();
  const accept = () =>
    act.mutate(
      { id: p.id, input: { action: "accept", title: title.trim(), body: body.trim(), rationale: rationale.trim(), roleIds } },
      { onSuccess: () => toast("Đã ghi quyết định.", "success"), onError: (e) => toast(errorMessage(e), "danger") },
    );
  const reject = () =>
    act.mutate(
      { id: p.id, input: { action: "reject" } },
      {
        onSuccess: () => {
          toast("Đã từ chối đề xuất. Audit vẫn giữ lại.", "success");
          setRejecting(false);
        },
        onError: (e) => toast(errorMessage(e), "danger"),
      },
    );
  const party = role ? { displayName: role.name, mascot: role.mascot, human: false, role } : null;
  return (
    <article aria-label={`Đề xuất: ${p.title}`} className="rounded-oh-lg border border-oh-border bg-oh-surface p-4 shadow-oh-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        {party && <AuthorLabel party={party} extra={<span>đề xuất · {relativeTimeVi(p.createdAt)}</span>} />}
        <Badge tone="agent" icon="decision">Đề xuất</Badge>
      </header>
      <div data-trust="agent-draft" className="mt-3 space-y-3 rounded-oh-lg border-2 border-dashed border-oh-agent bg-oh-agent-soft p-3">
        <p className="text-oh-xs text-oh-ink-muted">Nội dung do agent viết, chưa xác minh. Sửa trước khi ghi nếu cần.</p>
        <div className="space-y-1">
          <label htmlFor={`pt-${p.id}`} className="block text-oh-sm font-medium">Tiêu đề</label>
          <TextInput id={`pt-${p.id}`} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="bg-oh-surface" />
        </div>
        <div className="space-y-1">
          <label htmlFor={`pb-${p.id}`} className="block text-oh-sm font-medium">Nội dung</label>
          <TextArea id={`pb-${p.id}`} rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className="bg-oh-surface" />
        </div>
        <div className="space-y-1">
          <label htmlFor={`pr-${p.id}`} className="block text-oh-sm font-medium">Lý do (bắt buộc)</label>
          <TextArea id={`pr-${p.id}`} rows={2} maxLength={5000} value={rationale} onChange={(e) => setRationale(e.target.value)} className="bg-oh-surface" />
        </div>
      </div>
      <div className="mt-3">
        <RoleChips roles={roles} value={roleIds} onChange={setRoleIds} label="Vai trò liên quan (agent của họ thấy quyết định trước)" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" icon="decision" disabled={!valid || act.isPending} onClick={accept}>Ghi quyết định</Button>
        <Button variant="ghost" icon="cancel" disabled={act.isPending} onClick={() => setRejecting(true)}>Từ chối</Button>
      </div>
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Từ chối đề xuất này?"
        description="Đề xuất đóng lại, không thành quyết định. Audit vẫn ghi lại."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Giữ lại</Button>
            <Button variant="danger" loading={act.isPending} onClick={reject} data-autofocus>Từ chối</Button>
          </>
        }
      />
    </article>
  );
}
