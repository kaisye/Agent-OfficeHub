"use client";

import Link from "next/link";
import { useState } from "react";
import { BUDDIES } from "@officehub/brand";
import { Badge, Button, Drawer, Icon, Mascot, StatusBadge, relativeTimeVi, requestDirectionLabel } from "@officehub/ui";
import type { Board, Member } from "@officehub/shared";
import { memberMap } from "@/lib/requests";
import { NewRequestDialog } from "./new-request-dialog";
import { StatusEditor } from "./status-editor";
import { useWorkspace } from "./workspace";

/** Profile drawer: status, open requests between you, "Tạo yêu cầu" (or your own status editor). */
export function ProfileDrawer({ member, board, onClose }: { member: Member | null; board: Board; onClose: () => void }) {
  const { slug, me } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const open = !!member;
  const m = member;
  const status = m ? (board.cards.find((c) => c.memberId === m.id) ?? null) : null;
  const presence = status?.presence ?? "offline";
  const isMe = m?.id === me.id;
  const map = memberMap(board.members);
  const buddy = m ? BUDDIES[m.mascot.buddy] : null;
  const waiting = (status?.waitingOn ?? []).map((id) => map.get(id)).filter((x): x is Member => !!x);
  const between = m
    ? board.openRequests.filter((r) => (r.askerId === me.id && r.receiverId === m.id) || (r.askerId === m.id && r.receiverId === me.id))
    : [];

  return (
    <>
      <Drawer
        open={open && !creating}
        onClose={() => {
          setEditing(false);
          onClose();
        }}
        title={m ? `Hồ sơ ${m.displayName}` : "Hồ sơ"}
      >
        {m && buddy && (
          <div className="space-y-5">
            <div className="oh-arch h-52" style={{ background: buddy.tint }}>
              <Mascot mascot={m.mascot} presence={presence} size={160} agentBadge={status?.updatedBy === "agent"} title={`${m.displayName}, ${buddy.name}`} />
            </div>
            <div>
              <h3 className="text-oh-2xl font-bold">{m.displayName}{isMe && <span className="ml-2 text-oh-sm font-normal text-oh-ink-muted">(bạn)</span>}</h3>
              <p className="mt-0.5 text-oh-sm text-oh-ink-muted">{buddy.name} · {buddy.role}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge presence={presence} />
                {m.areas.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
                {m.role === "admin" && <Badge tone="human">Quản trị</Badge>}
              </div>
            </div>

            <dl className="space-y-3 rounded-oh-lg bg-oh-surface-2 p-4 text-oh-sm">
              <div>
                <dt className="text-oh-xs font-semibold text-oh-ink-muted">Đang làm gì</dt>
                <dd>{status?.doing ?? "Chưa có cập nhật."}</dd>
              </div>
              {status?.branch && (
                <div>
                  <dt className="text-oh-xs font-semibold text-oh-ink-muted">Nhánh</dt>
                  <dd className="font-mono text-oh-xs">{status.branch}</dd>
                </div>
              )}
              <div>
                <dt className="text-oh-xs font-semibold text-oh-ink-muted">Chờ ai</dt>
                <dd>{waiting.length > 0 ? waiting.map((w) => w.displayName).join(", ") : "Không chờ ai."}</dd>
              </div>
              {status && (
                <p className="text-oh-xs text-oh-ink-muted">
                  Cập nhật {relativeTimeVi(status.updatedAt)}
                  {status.updatedBy === "agent" ? " · agent soạn hộ" : ""}
                </p>
              )}
            </dl>

            {isMe ? (
              editing ? (
                <StatusEditor slug={slug} me={me} members={board.members} current={status} onClose={() => setEditing(false)} />
              ) : (
                <Button variant="primary" icon="edit" className="w-full" onClick={() => setEditing(true)}>
                  Cập nhật trạng thái
                </Button>
              )
            ) : (
              <>
                <section aria-label="Yêu cầu giữa hai bạn">
                  <h3 className="mb-2 text-oh-sm font-semibold">Yêu cầu giữa hai bạn</h3>
                  {between.length === 0 ? (
                    <p className="text-oh-sm text-oh-ink-muted">Chưa có yêu cầu nào đang mở.</p>
                  ) : (
                    <ul>
                      {between.map((r) => (
                        <li key={r.id} className="border-b border-oh-border last:border-0">
                          <Link href={`/w/${slug}/requests?open=${r.id}`} className="flex items-center justify-between gap-2 py-2.5 text-oh-sm hover:text-oh-primary focus-visible:outline-3 focus-visible:outline-oh-focus">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{r.title}</span>
                              <small className="text-oh-xs text-oh-ink-muted">
                                {requestDirectionLabel(r, me.id, map.get(r.askerId)?.displayName ?? "", map.get(r.receiverId)?.displayName ?? "")}
                              </small>
                            </span>
                            <Icon name="chevron" size={14} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <Button variant="primary" icon="request" className="w-full" onClick={() => setCreating(true)}>
                  Tạo yêu cầu
                </Button>
              </>
            )}
          </div>
        )}
      </Drawer>
      {m && (
        <NewRequestDialog
          open={creating}
          onClose={() => {
            setCreating(false);
            onClose();
          }}
          slug={slug}
          members={board.members}
          tasks={board.tasks}
          meId={me.id}
          defaultReceiverId={m.id}
        />
      )}
    </>
  );
}
