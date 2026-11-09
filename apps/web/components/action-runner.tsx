"use client";

import { useState, type ReactNode } from "react";
import { ACTION_LABEL_VI, Button, Dialog, Mascot, useToast, type RequestActionHandler } from "@officehub/ui";
import type { Member, Request, RequestAction } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useActOnRequest } from "@/lib/hooks";
import { useStableCallback } from "@/lib/use-stable";

/** Actions that put words or a decision in front of another person: always confirmed first. */
const CONFIRM: ReadonlySet<RequestAction> = new Set(["send", "send_reply", "follow_up", "cancel"]);
export const needsConfirm = (a: RequestAction) => CONFIRM.has(a);

interface Pending {
  action: RequestAction;
  request: Request;
  body?: string;
}

const SUCCESS = (a: RequestAction, other: string) =>
  ({
    send: `Đã gửi cho ${other}.`,
    send_reply: `Đã gửi trả lời cho ${other}.`,
    follow_up: `Đã hỏi lại ${other}.`,
    accept: "Đã chấp nhận. Yêu cầu đã xong.",
    cancel: "Đã hủy yêu cầu.",
    draft_reply: "Đã lưu bản nháp trả lời. Chưa gửi cho ai.",
  })[a];

/**
 * Runs request actions through the API with a confirm step for sending actions.
 * Returns the handler (matches RequestCard.onAction) and the confirm dialog to render.
 */
export function useActionRunner(slug: string, members: Member[], meId: string, onDone?: (action: RequestAction, r: Request) => void) {
  const act = useActOnRequest(slug);
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const otherOf = (r: Request) => members.find((m) => m.id === (r.askerId === meId ? r.receiverId : r.askerId));

  const run = (p: Pending) => {
    const other = otherOf(p.request)?.displayName ?? "người kia";
    act.mutate(
      p.body === undefined ? { id: p.request.id, action: p.action } : { id: p.request.id, action: p.action, body: p.body },
      {
        onSuccess: (r) => {
          toast(SUCCESS(p.action, other), "success");
          setPending(null);
          onDone?.(p.action, r);
        },
        onError: (e) => {
          toast(errorMessage(e, { otherName: other }), "danger");
          setPending(null);
        },
      },
    );
  };

  const handle: RequestActionHandler = (action, request, body) => {
    const p: Pending = body === undefined ? { action, request } : { action, request, body };
    if (needsConfirm(action)) setPending(p);
    else run(p);
  };

  const close = useStableCallback(() => setPending(null));

  const dialog = pending ? (
    <ConfirmDialog pending={pending} other={otherOf(pending.request)} busy={act.isPending} onClose={close} onConfirm={() => run(pending)} />
  ) : null;

  return { handle, dialog, busy: act.isPending };
}

function ConfirmDialog({
  pending,
  other,
  busy,
  onClose,
  onConfirm,
}: {
  pending: Pending;
  other: Member | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = other?.displayName ?? "người kia";
  const { action, request, body } = pending;
  const shown = body ?? [...request.messages].reverse().find((m) => m.sentById === null)?.body;
  let title: string;
  let description: string;
  let confirmLabel = ACTION_LABEL_VI[action];
  let danger = false;
  switch (action) {
    case "send":
      title = `Gửi yêu cầu cho ${name}?`;
      description = `Chỉ khi bạn bấm Gửi, yêu cầu mới tới ${name}.`;
      confirmLabel = "Gửi";
      break;
    case "send_reply":
      title = `Gửi trả lời cho ${name}?`;
      description = `Câu trả lời tới ${name} khi bạn bấm.`;
      break;
    case "follow_up":
      title = `Hỏi lại ${name}?`;
      description = `Yêu cầu quay về ${name} kèm câu hỏi thêm.`;
      break;
    case "cancel":
      title = "Hủy yêu cầu này?";
      description = request.status === "draft" ? "Bản nháp sẽ không được gửi đi." : `${name} sẽ được báo nếu đã nhận. Không hoàn tác được.`;
      danger = true;
      break;
    default:
      title = ACTION_LABEL_VI[action];
      description = "";
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {danger ? "Giữ lại" : "Để sau"}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {action !== "cancel" && shown && <Preview other={other}>{shown}</Preview>}
    </Dialog>
  );
}

function Preview({ other, children }: { other: Member | undefined; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {other && <Mascot mascot={other.mascot} mood="relaxed" size={32} title={other.displayName} />}
      <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-oh-md bg-oh-surface-2 p-3 text-oh-sm">{children}</p>
    </div>
  );
}
