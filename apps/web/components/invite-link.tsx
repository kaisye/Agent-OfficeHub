"use client";

import { useState } from "react";
import { Button, Icon, useToast } from "@officehub/ui";
import { getApi } from "@/lib/api";
import type { InviteLink } from "@/lib/api/types";
import { errorMessage } from "@/lib/errors";

/** Admin only: create a one-time login link for a member (also used to reset a forgotten password). */
export function InviteLinkPanel({ slug, memberId, name }: { slug: string; memberId: string; name: string }) {
  const toast = useToast();
  const [link, setLink] = useState<InviteLink | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      setLink(await getApi().inviteMember(slug, memberId));
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast("Đã copy link mời.", "success");
    } catch {
      toast("Không copy được, hãy chọn và copy thủ công.", "danger");
    }
  };

  return (
    <section aria-labelledby="invite-h" className="rounded-oh-lg border border-dashed border-oh-border-strong p-3">
      <h3 id="invite-h" className="flex items-center gap-1.5 text-oh-sm font-semibold">
        <Icon name="key" size={14} /> Link đăng nhập cho {name}
      </h3>
      <p className="mt-1 text-oh-xs text-oh-ink-muted">
        Link dùng một lần, hết hạn sau 48 giờ. Gửi riêng cho {name} (Zalo, Messenger). Tạo link mới cũng là cách đặt lại mật khẩu.
      </p>
      {link ? (
        <div className="mt-2 space-y-2">
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link mời"
            className="w-full rounded-oh-md border border-oh-border bg-oh-surface-2 px-2 py-1.5 font-mono text-[11px]"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-oh-ink-muted">Hết hạn {new Date(link.expiresAt).toLocaleString("vi-VN")}</span>
            <Button size="sm" variant="secondary" icon="copy" onClick={copy}>
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="mt-2 w-full" icon="link" onClick={create} disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo link mời"}
        </Button>
      )}
    </section>
  );
}
