"use client";

import { useState, type ReactNode } from "react";
import { ACTION_LABEL_VI, Button, Dialog, useToast } from "@officehub/ui";
import type { Request, RequestAction } from "@officehub/shared";
import { errorMessage } from "@/lib/errors";
import { useActOnRequest } from "@/lib/hooks";
import { useStableCallback } from "@/lib/use-stable";

/** Actions that move words to the other side, or stop a request: confirmed first on the detail screen. */
const CONFIRM: ReadonlySet<RequestAction> = new Set(["send", "send_reply", "follow_up", "cancel"]);
export const needsConfirm = (a: RequestAction) => CONFIRM.has(a);

export interface Pending {
  action: RequestAction;
  request: Request;
  body?: string;
  autoForwardReply?: boolean;
}

/** Display name of the party a step delivers to (v0.6: the human is the gate for both sides). */
export type TargetName = (r: Request, action: RequestAction) => string;

const SUCCESS = (a: RequestAction, to: string) =>
  ({
    send: `Đã chuyển cho ${to}.`,
    send_reply: `Đã chuyển trả lời cho ${to}.`,
    follow_up: `Đã hỏi lại ${to}.`,
    accept: "Đã đóng yêu cầu.",
    cancel: "Đã hủy yêu cầu.",
    draft_reply: "Đã lưu nháp trả lời. Chưa chuyển cho ai.",
  })[a];

/** Runs request actions through the API with a confirm step for sending actions. */
export function useActionRunner(slug: string, targetName: TargetName, onDone?: (action: RequestAction, r: Request) => void) {
  const act = useActOnRequest(slug);
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const run = (p: Pending) => {
    const to = targetName(p.request, p.action);
    act.mutate(
      { id: p.request.id, action: p.action, body: p.body, autoForwardReply: p.autoForwardReply },
      {
        onSuccess: (r) => {
          toast(SUCCESS(p.action, to), "success");
          setPending(null);
          onDone?.(p.action, r);
        },
        onError: (e) => {
          toast(errorMessage(e, { otherName: to }), "danger");
          setPending(null);
        },
      },
    );
  };

  const handle = (p: Pending) => {
    if (needsConfirm(p.action)) setPending(p);
    else run(p);
  };

  const close = useStableCallback(() => setPending(null));
  const dialog = pending ? <ConfirmDialog pending={pending} to={targetName(pending.request, pending.action)} busy={act.isPending} onClose={close} onConfirm={() => run(pending)} /> : null;
  return { handle, dialog, busy: act.isPending };
}

function ConfirmDialog({ pending, to, busy, onClose, onConfirm }: { pending: Pending; to: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { action, request, body } = pending;
  const shown = body ?? [...request.messages].reverse().find((m) => m.sentById === null)?.body;
  let title: string;
  let description: string;
  let danger = false;
  switch (action) {
    case "send":
      title = `Chuyển cho ${to}?`;
      description = pending.autoForwardReply ? `Câu trả lời của ${to} sẽ tự về bên hỏi, không cần bạn duyệt lần hai.` : `Chỉ khi bạn bấm, yêu cầu mới tới ${to}.`;
      break;
    case "send_reply":
      title = `Chuyển trả lời cho ${to}?`;
      description = `Câu trả lời tới ${to} khi bạn bấm.`;
      break;
    case "follow_up":
      title = "Hỏi lại?";
      description = `Yêu cầu quay về ${to} kèm câu hỏi thêm.`;
      break;
    case "cancel":
      title = "Hủy yêu cầu này?";
      description = "Agent hai bên thấy yêu cầu đã hủy. Không hoàn tác được.";
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
            {danger ? "Hủy yêu cầu" : ACTION_LABEL_VI[action]}
          </Button>
        </>
      }
    >
      {action !== "cancel" && shown && <Preview>{shown}</Preview>}
    </Dialog>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap rounded-oh-md bg-oh-surface-2 p-3 text-oh-sm">{children}</p>;
}
