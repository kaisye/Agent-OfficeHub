"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ACTION_LABEL_VI,
  Badge,
  Button,
  Card,
  DraftBlock,
  EmptyState,
  Icon,
  Mascot,
  TaskChip,
  UntrustedQuote,
  availableActions,
  relativeTimeVi,
  requestStatusText,
} from "@officehub/ui";
import { bodyRequirement, canSeeMessage, type Actor, type Member, type Request, type RequestAction, type RequestMessage } from "@officehub/shared";
import { isApiError } from "@/lib/api";
import { useBoard, useMarkRead, useRequest } from "@/lib/hooks";
import { memberMap } from "@/lib/requests";
import { useActionRunner } from "./action-runner";
import { TextArea } from "./form";
import { ListSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace";

const KIND_LABEL: Record<RequestMessage["kind"], string> = { ask: "Câu hỏi", reply: "Trả lời", follow_up: "Hỏi lại" };

export function RequestDetail() {
  const { id } = useParams<{ id: string }>();
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
    return (
      <EmptyState
        title="Chưa tải được yêu cầu"
        mood="worried"
        description="Chưa kết nối được. Thử lại sau nhé."
        action={<Button onClick={() => void found.refetch()}>Thử lại</Button>}
      />
    );
  }
  if (!board.data || (!request && !found.isError)) return <ListSkeleton rows={2} label="Đang tải yêu cầu…" />;
  if (!request) {
    return (
      <EmptyState
        title="Không tìm thấy yêu cầu này"
        mood="curious"
        description="Yêu cầu có thể đã bị xóa, hoặc bạn không phải một bên của nó."
        action={
          <Link href={`/w/${slug}/requests`} className="rounded-oh-md bg-oh-primary px-4 py-2 text-oh-primary-fg">
            Về danh sách yêu cầu
          </Link>
        }
      />
    );
  }
  const map = memberMap(board.data.members);
  const asker = map.get(request.askerId);
  const receiver = map.get(request.receiverId);
  if (!asker || !receiver) return null;
  const task = board.data.tasks.find((t) => t.id === request.taskId);
  return <Thread key={request.id} slug={slug} me={me} request={request} asker={asker} receiver={receiver} members={board.data.members} task={task} />;
}

function Thread({
  slug,
  me,
  request,
  asker,
  receiver,
  members,
  task,
}: {
  slug: string;
  me: Member;
  request: Request;
  asker: Member;
  receiver: Member;
  members: Member[];
  task: import("@officehub/shared").Task | undefined;
}) {
  const search = useSearchParams();
  const actor: Actor = { kind: "human", memberId: me.id };
  const actions = availableActions(request, actor);
  const side = me.id === request.askerId ? "asker" : me.id === request.receiverId ? "receiver" : "observer";
  const other = side === "receiver" ? asker : receiver;
  const { label, help } = requestStatusText(request, side, other.displayName);
  const runner = useActionRunner(slug, members, me.id, () => {
    setComposing(null);
    setEditing(false);
    setText("");
  });

  // Defensive: even though the server redacts, never render a message the viewer must not see.
  const visible = request.messages.filter((m) => canSeeMessage(request, m, me.id));
  const draft = [...visible].reverse().find((m) => m.sentById === null) ?? null;
  const draftAction: RequestAction | null = draft ? (draft.kind === "reply" ? "send_reply" : "send") : null;
  const canSendDraft = !!draftAction && actions.includes(draftAction);

  const [composing, setComposing] = useState<RequestAction | null>(null);
  const [editing, setEditing] = useState(search.get("edit") === "1" && !!draft);
  const [text, setText] = useState(search.get("edit") === "1" && draft ? draft.body : "");

  const overdue = !!request.dueAt && ["sent", "reply_drafted", "replied"].includes(request.status) && new Date(request.dueAt).getTime() < Date.now();
  const byId = (id: string | null) => members.find((m) => m.id === id);

  const footerActions = actions.filter((a) => a !== draftAction);
  const startCompose = (a: RequestAction) => {
    if (bodyRequirement(a, request.status) === "required") {
      setEditing(false);
      setComposing(a);
      setText("");
    } else runner.handle(a, request);
  };
  const startEdit = () => {
    if (!draft) return;
    setComposing(null);
    setEditing(true);
    setText(draft.body);
  };
  const submitCompose = () => {
    if (!composing || !text.trim()) return;
    runner.handle(composing, request, text.trim());
  };
  const submitDraft = () => {
    if (!draftAction) return;
    const changed = editing && text.trim() && text.trim() !== draft?.body;
    if (changed) runner.handle(draftAction, request, text.trim());
    else runner.handle(draftAction, request);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/w/${slug}/requests`} className="inline-flex items-center gap-1 text-oh-sm text-oh-ink-muted hover:text-oh-ink focus-visible:outline-3 focus-visible:outline-oh-focus">
        <Icon name="reply" size={14} />
        Tất cả yêu cầu
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 flex-1 text-oh-2xl font-bold">{request.title}</h1>
          <div className="flex gap-1.5">
            {overdue && (
              <Badge tone="danger" icon="alert">
                Quá hạn
              </Badge>
            )}
            <Badge tone={request.status === "closed" ? "success" : request.status === "cancelled" ? "neutral" : "warning"}>{label}</Badge>
          </div>
        </div>
        <p className="text-oh-sm text-oh-ink-muted">{help}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-oh-sm">
          <span className="inline-flex items-center gap-2">
            <Mascot mascot={asker.mascot} mood="relaxed" size={32} title={asker.displayName} />
            <b>{asker.displayName}</b>
            <Icon name="reply" size={14} className="rotate-180 text-oh-ink-muted" />
            <Mascot mascot={receiver.mascot} mood="relaxed" size={32} title={receiver.displayName} />
            <b>{receiver.displayName}</b>
          </span>
          {request.dueAt && <span className="text-oh-ink-muted">Hạn {new Date(request.dueAt).toLocaleDateString("vi-VN")}</span>}
          {task && (
            <span className="inline-flex items-center gap-2">
              <TaskChip task={task} />
              <Link href={`/w/${slug}/tasks/${task.id}`} className="font-medium underline-offset-2 hover:underline">
                Bàn giao
              </Link>
            </span>
          )}
        </div>
      </header>

      <section aria-label="Chuỗi trao đổi">
        <ol className="space-y-3">
          {visible.map((m) => {
            const authorId = m.kind === "reply" ? request.receiverId : request.askerId;
            const author = byId(authorId)!;
            const mine = authorId === me.id;
            const approver = byId(m.sentById);
            const isDraft = m.sentById === null;
            return (
              <li key={m.id} className="space-y-1">
                <p className="flex items-center gap-2 text-oh-xs text-oh-ink-muted">
                  <span className="font-semibold">{KIND_LABEL[m.kind]}</span>
                  <span>·</span>
                  <time dateTime={m.createdAt}>{relativeTimeVi(m.createdAt)}</time>
                </p>
                {isDraft && m.authoredBy === "agent" ? (
                  editing ? (
                    <DraftEditor
                      value={text}
                      onChange={setText}
                      onCancel={() => setEditing(false)}
                      onSend={canSendDraft ? submitDraft : undefined}
                      sendLabel={draftAction ? ACTION_LABEL_VI[draftAction] : "Gửi"}
                      busy={runner.busy}
                      label="Sửa bản nháp của agent"
                    />
                  ) : (
                    <DraftBlock
                      owner={author}
                      onEdit={canSendDraft ? startEdit : undefined}
                      onSend={canSendDraft ? submitDraft : undefined}
                      sendLabel={draftAction ? ACTION_LABEL_VI[draftAction] : "Gửi"}
                      disabled={runner.busy}
                    >
                      {m.body}
                    </DraftBlock>
                  )
                ) : isDraft ? (
                  editing ? (
                    <DraftEditor
                      value={text}
                      onChange={setText}
                      onCancel={() => setEditing(false)}
                      onSend={canSendDraft ? submitDraft : undefined}
                      sendLabel={draftAction ? ACTION_LABEL_VI[draftAction] : "Gửi"}
                      busy={runner.busy}
                      label="Sửa bản nháp"
                    />
                  ) : (
                    <Card className="border-dashed">
                      <p className="mb-1 text-oh-xs font-medium text-oh-ink-muted">Bản nháp của bạn · chưa gửi, chỉ mình bạn thấy</p>
                      <p className="whitespace-pre-wrap text-oh-base">{m.body}</p>
                      {canSendDraft && (
                        <div className="mt-3 flex gap-2">
                          <Button icon="edit" onClick={startEdit} disabled={runner.busy}>
                            Sửa
                          </Button>
                          <Button variant="primary" icon="send" onClick={submitDraft} disabled={runner.busy}>
                            {draftAction ? ACTION_LABEL_VI[draftAction] : "Gửi"}
                          </Button>
                        </div>
                      )}
                    </Card>
                  )
                ) : mine ? (
                  <div className="rounded-oh-md bg-oh-surface-2 p-3">
                    <p className="whitespace-pre-wrap text-oh-sm">{m.body}</p>
                    <p className="mt-1 text-oh-xs text-oh-ink-muted">
                      Bạn đã gửi{m.authoredBy === "agent" ? " · Agent soạn, bạn đã duyệt" : ""}
                      {m.editedBeforeSend ? " · Đã chỉnh sửa" : ""}
                    </p>
                  </div>
                ) : (
                  <>
                    <UntrustedQuote authorName={author.displayName} author={author} fromAgent={m.authoredBy === "agent"}>
                      {m.body}
                    </UntrustedQuote>
                    {(m.authoredBy === "agent" || m.editedBeforeSend) && (
                      <p className="text-oh-xs text-oh-ink-muted">
                        {m.authoredBy === "agent" && approver ? `Agent soạn · đã duyệt bởi ${approver.displayName}` : ""}
                        {m.editedBeforeSend ? `${m.authoredBy === "agent" ? " · " : ""}Đã chỉnh sửa` : ""}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {composing && (
        <Card as="section" aria-label="Soạn nội dung" className="space-y-3 border-oh-primary">
          <label htmlFor="body" className="block text-oh-sm font-medium">
            {composing === "follow_up" ? `Câu hỏi thêm cho ${other.displayName}` : composing === "draft_reply" ? "Soạn bản nháp trả lời" : "Nội dung trả lời"}
          </label>
          <TextArea id="body" data-autofocus autoFocus rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-oh-xs text-oh-ink-muted">Không dán khóa bí mật (API key, token) vào đây. Gửi key qua kênh bí mật.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setComposing(null)}>
              Để sau
            </Button>
            <Button variant={composing === "draft_reply" || composing === "follow_up" ? "secondary" : "primary"} icon={composing === "draft_reply" ? "draft" : "send"} disabled={!text.trim() || runner.busy} onClick={submitCompose}>
              {composing === "draft_reply" ? "Lưu nháp trả lời" : ACTION_LABEL_VI[composing]}
            </Button>
          </div>
        </Card>
      )}

      {!composing && footerActions.length > 0 && (
        <section aria-label="Việc bạn có thể làm" className="flex flex-wrap gap-2 border-t border-oh-border pt-4">
          {footerActions.map((a) => (
            <Button
              key={a}
              variant={a === "send_reply" || a === "accept" ? "primary" : a === "cancel" ? "ghost" : "secondary"}
              icon={a === "accept" ? "check" : a === "cancel" ? "cancel" : a === "draft_reply" ? "draft" : a === "follow_up" ? "reply" : "send"}
              disabled={runner.busy}
              onClick={() => startCompose(a)}
            >
              {ACTION_LABEL_VI[a]}
            </Button>
          ))}
        </section>
      )}
      {actions.length === 0 && (
        <p className="border-t border-oh-border pt-4 text-oh-sm text-oh-ink-muted">
          {side === "observer" ? "Bạn đang xem với tư cách quản trị, chỉ đọc." : "Chưa có việc nào cần bạn làm ở bước này."}
        </p>
      )}
      {runner.dialog}
    </div>
  );
}

function DraftEditor({
  value,
  onChange,
  onCancel,
  onSend,
  sendLabel,
  busy,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSend?: () => void;
  sendLabel: string;
  busy: boolean;
  label: string;
}) {
  return (
    <Card className="space-y-3 border-oh-primary">
      <label htmlFor="draft-body" className="block text-oh-sm font-medium">
        {label}
      </label>
      <TextArea id="draft-body" data-autofocus autoFocus rows={5} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-oh-xs text-oh-ink-muted">Bạn đã sửa thì tin gửi đi mang nhãn "Đã chỉnh sửa". Không dán khóa bí mật vào đây.</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Thôi sửa
        </Button>
        {onSend && (
          <Button variant="primary" icon="send" disabled={!value.trim() || busy} onClick={onSend}>
            {sendLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
