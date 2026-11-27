"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACTION_LABEL_VI, Badge, Button, Card, EmptyState, Icon, TaskChip, availableActions, relativeTimeVi, requestStatusText } from "@officehub/ui";
import { bodyRequirement, canAutoForward, canSeeMessage, type Actor, type Member, type Request, type RequestAction, type RequestMessage, type Role, type Task } from "@officehub/shared";
import { isApiError } from "@/lib/api";
import { useBoard, useMarkRead, useRequest } from "@/lib/hooks";
import { authorOf, isOverdue, partyOf, roleMap } from "@/lib/requests";
import { useActionRunner } from "./action-runner";
import { TextArea } from "./form";
import { AuthorLabel, KindChip, MessageText, PartyRoute } from "./parties";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

const MSG_KIND: Record<RequestMessage["kind"], string> = { ask: "Câu hỏi", reply: "Trả lời", follow_up: "Hỏi lại" };

export function RequestDetail({ id: idProp, embedded }: { id?: string; embedded?: boolean } = {}) {
  const params = useParams<{ id: string }>();
  const id = idProp ?? params.id;
  const { slug, me } = useWorkspace();
  const board = useBoard(slug);
  const found = useRequest(slug, id);
  const markRead = useMarkRead(slug);
  const request = found.data;

  // Mark read on open (once per unread request).
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (request?.unreadForViewer && marked.current !== request.id) {
      marked.current = request.id;
      markRead.mutate(request.id);
    }
  }, [request?.id, request?.unreadForViewer, markRead]);

  if (found.isError && !(isApiError(found.error) && found.error.code === "not_found")) {
    return <EmptyState title="Chưa tải được yêu cầu" mood="worried" description="Chưa kết nối được. Thử lại sau nhé." action={<Button onClick={() => void found.refetch()}>Thử lại</Button>} />;
  }
  if (!board.data || (!request && !found.isError)) return <ListSkeleton rows={2} label="Đang tải yêu cầu…" />;
  if (!request) {
    return (
      <EmptyState
        title="Không tìm thấy yêu cầu này"
        mood="curious"
        description="Yêu cầu có thể đã bị xóa hoặc thuộc văn phòng khác."
        action={<Link href={`/w/${slug}/requests`} className="rounded-oh-md bg-oh-primary px-4 py-2 text-oh-primary-fg">Về danh sách yêu cầu</Link>}
      />
    );
  }
  const task = board.data.tasks.find((t) => t.id === request.taskId);
  return <Thread key={request.id} embedded={!!embedded} slug={slug} me={me} request={request} roles={roleMap(board.data.roles)} orchestrator={board.data.orchestrator} task={task} />;
}

function Thread({ embedded, slug, me, request, roles, orchestrator, task }: { embedded: boolean; slug: string; me: Member; request: Request; roles: Map<string, Role>; orchestrator: Member; task: Task | undefined }) {
  const actor: Actor = { kind: "human", memberId: me.id };
  // Every human step the state machine allows. draft_reply is the agents' job: the orchestrator answers with send_reply.
  const actions = availableActions(request, actor).filter((a) => a !== "draft_reply");
  const asker = partyOf(request.askerRoleId, roles, orchestrator);
  const receiver = partyOf(request.receiverRoleId, roles, orchestrator);
  const nameOf = (p: typeof asker) => (p.human ? "bạn" : p.displayName);
  const target = (_r: Request, a: RequestAction) => nameOf(a === "send_reply" ? asker : receiver);
  const { label, help } = requestStatusText(request, { asker: asker.displayName, receiver: nameOf(receiver) });
  const [composing, setComposing] = useState<RequestAction | null>(null);
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(false);
  const runner = useActionRunner(slug, target, () => {
    setComposing(null);
    setText("");
  });

  // Defensive: even though the server decides visibility, never render what the viewer must not see.
  const visible = request.messages.filter((m) => canSeeMessage(request, m, { kind: "human" }));
  const draft = [...visible].reverse().find((m) => m.sentById === null) ?? null;
  const draftAction: RequestAction | null = draft ? (draft.kind === "reply" ? "send_reply" : "send") : null;
  const canSendDraft = !!draftAction && actions.includes(draftAction);
  const [edit, setEdit] = useState(draft?.body ?? "");
  const footerActions = actions.filter((a) => a !== draftAction || !draft);

  const start = (a: RequestAction) => {
    if (bodyRequirement(a, request.status) === "required") {
      setComposing(a);
      setText("");
    } else runner.handle({ action: a, request });
  };
  const sendDraft = () => {
    if (!draftAction || !draft) return;
    const changed = edit.trim() && edit.trim() !== draft.body ? edit.trim() : undefined;
    runner.handle({ action: draftAction, request, body: changed, autoForwardReply: draftAction === "send" && auto ? true : undefined });
  };
  const composeLabel =
    composing === "follow_up" ? `Câu hỏi thêm cho ${nameOf(receiver)}` : composing === "send_reply" ? (receiver.human ? `Trả lời ${asker.displayName}` : `Trả lời thay ${receiver.displayName}`) : "Nội dung";

  return (
    <div className={embedded ? "space-y-5" : "mx-auto max-w-3xl space-y-5"}>
      {!embedded && (
        <Link href={`/w/${slug}/requests`} className="inline-flex items-center gap-1 text-oh-sm text-oh-ink-muted hover:text-oh-ink focus-visible:outline-3 focus-visible:outline-oh-focus">
          <Icon name="reply" size={14} />
          Tất cả yêu cầu
        </Link>
      )}

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PartyRoute request={request} roles={roles} orchestrator={orchestrator} size={32} />
          <KindChip kind={request.kind} />
          {request.autoForwardReply && <Badge tone="agent" icon="send">Tự chuyển trả lời</Badge>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 flex-1 text-oh-xl font-bold sm:text-oh-2xl">{request.title}</h1>
          <div className="flex gap-1.5">
            {isOverdue(request) && <Badge tone="danger" icon="alert">Quá hạn</Badge>}
            <Badge tone={request.status === "closed" ? "success" : request.status === "cancelled" ? "neutral" : "warning"}>{label}</Badge>
          </div>
        </div>
        <p className="text-oh-sm text-oh-ink-muted">{help}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-oh-sm">
          {request.dueAt && <span className="text-oh-ink-muted">Hạn {new Date(request.dueAt).toLocaleDateString("vi-VN")}</span>}
          {task && (
            <span className="inline-flex items-center gap-2">
              <TaskChip task={task} />
              <Link href={`/w/${slug}/tasks/${task.id}`} className="whitespace-nowrap font-medium underline-offset-2 hover:underline">Bàn giao</Link>
            </span>
          )}
        </div>
      </header>

      <section aria-label="Chuỗi trao đổi">
        <ol className="space-y-3">
          {visible.map((m) => {
            const who = authorOf(m, request, roles, orchestrator);
            const isDraft = m.sentById === null;
            return (
              <li key={m.id} className="space-y-1">
                <p className="flex items-center gap-2 text-oh-xs text-oh-ink-muted">
                  <span className="font-semibold">{MSG_KIND[m.kind]}</span>
                  <span>·</span>
                  <time dateTime={m.createdAt}>{relativeTimeVi(m.createdAt)}</time>
                  {!isDraft && m.authoredBy === "agent" && <span>· bạn đã chuyển{m.editedBeforeSend ? " (đã sửa)" : ""}</span>}
                </p>
                {isDraft ? (
                  <div data-trust={who.human ? "orchestrator" : "agent-draft"} className={who.human ? "space-y-2 rounded-oh-lg border-2 border-dashed border-oh-border-strong bg-oh-surface p-4" : "space-y-2 rounded-oh-lg border-2 border-dashed border-oh-agent bg-oh-agent-soft p-4"}>
                    <AuthorLabel party={who} extra={<span>· nháp, chưa chuyển{who.human ? "" : " · nội dung do agent viết, chưa xác minh"}</span>} />
                    {canSendDraft && m.id === draft?.id ? (
                      <>
                        <label htmlFor="draft-body" className="sr-only">Sửa nháp trước khi chuyển</label>
                        <TextArea id="draft-body" rows={5} maxLength={8000} value={edit} onChange={(e) => setEdit(e.target.value)} className="bg-oh-surface" />
                        {draftAction === "send" && canAutoForward(request.kind) && request.receiverRoleId && (
                          <label className="flex items-start gap-2 text-oh-sm">
                            <input type="checkbox" className="mt-0.5 size-4" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                            <span>Tự chuyển câu trả lời <small className="block text-oh-xs text-oh-ink-muted">Trả lời của {receiver.displayName} về thẳng {asker.displayName}, không cần duyệt lần hai.</small></span>
                          </label>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="primary" icon="send" disabled={runner.busy || !edit.trim()} onClick={sendDraft}>
                            {ACTION_LABEL_VI[draftAction!]}
                          </Button>
                          {edit !== m.body && <Button variant="ghost" onClick={() => setEdit(m.body)}>Bỏ sửa</Button>}
                        </div>
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap text-oh-base">{m.body}</p>
                    )}
                  </div>
                ) : (
                  <MessageText m={m} request={request} roles={roles} orchestrator={orchestrator} />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {composing && (
        <Card as="section" aria-label="Soạn nội dung" className="space-y-3 border-oh-primary">
          <label htmlFor="body" className="block text-oh-sm font-medium">{composeLabel}</label>
          <TextArea id="body" data-autofocus autoFocus rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-oh-xs text-oh-ink-muted">Không dán khóa bí mật (API key, token) vào đây.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setComposing(null)}>Để sau</Button>
            <Button variant="primary" icon="send" disabled={!text.trim() || runner.busy} onClick={() => runner.handle({ action: composing, request, body: text.trim() })}>
              {composing === "follow_up" ? "Gửi câu hỏi lại" : composing === "send_reply" ? "Gửi trả lời" : ACTION_LABEL_VI[composing]}
            </Button>
          </div>
        </Card>
      )}

      {!composing && footerActions.length > 0 && (
        <section aria-label="Việc bạn có thể làm" className="flex flex-wrap gap-2 border-t border-oh-border pt-4">
          {footerActions.map((a) => (
            <Button
              key={a}
              variant={a === "accept" ? "primary" : a === "cancel" ? "ghost" : "secondary"}
              icon={a === "accept" ? "check" : a === "cancel" ? "cancel" : a === "follow_up" ? "reply" : "send"}
              disabled={runner.busy}
              onClick={() => start(a)}
            >
              {a === "send_reply" ? (receiver.human ? "Trả lời" : `Trả lời thay ${receiver.displayName}`) : ACTION_LABEL_VI[a]}
            </Button>
          ))}
        </section>
      )}
      {actions.length === 0 && <p className="border-t border-oh-border pt-4 text-oh-sm text-oh-ink-muted">Yêu cầu đã kết thúc, không còn bước nào.</p>}
      {runner.dialog}
    </div>
  );
}
