"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUDDIES } from "@officehub/brand";
import { Badge, Button, Drawer, Icon, Mascot, StatusBadge, relativeTimeVi, useToast } from "@officehub/ui";
import { PresenceState, outOfArea, type Agent, type Board, type Role } from "@officehub/shared";
import { PRESENCE_LABEL_VI } from "@officehub/ui";
import { errorMessage } from "@/lib/errors";
import { useAgents, useUpdateRole, useUpdateRoleStatus } from "@/lib/hooks";
import { cardOf, directionLabel, roleMap } from "@/lib/requests";
import { AddAgentDialog, AgentRow, RevealPanel, RevokeDialog } from "./agents-screen";
import { Field, Select, TextArea, TextInput } from "./form";
import { NewRequestDialog } from "./new-request-dialog";
import { KindChip } from "./parties";
import { useWorkspace } from "./workspace";

/** Role drawer: mission, owned paths (editable), handoff, wave, its agents + tokens, manual status. */
export function RoleDrawer({ role, board, onClose }: { role: Role | null; board: Board; onClose: () => void }) {
  const { slug } = useWorkspace();
  const agents = useAgents(slug);
  const [dialog, setDialog] = useState<"assign" | "token" | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [revealed, setRevealed] = useState<{ agent: Agent; token: string } | null>(null);
  const [editing, setEditing] = useState<"role" | "status" | null>(null);
  useEffect(() => {
    setEditing(null);
    setRevealed(null);
  }, [role?.id]);

  const r = role;
  const status = r ? cardOf(board, r.id) : null;
  const presence = status?.presence ?? "offline";
  const roles = roleMap(board.roles);
  const waiting = (status?.waitingOn ?? []).map((id) => roles.get(id)?.name).filter(Boolean);
  const out = r ? outOfArea(r, status?.paths ?? [], board.roles) : [];
  const mine = (agents.data ?? []).filter((a) => a.roleId === r?.id);
  const open = board.openRequests.filter((x) => r && (x.askerRoleId === r.id || x.receiverRoleId === r.id));
  const buddy = r ? BUDDIES[r.mascot.buddy] : null;

  return (
    <>
      <Drawer open={!!r && !dialog && !revoking} onClose={onClose} title={r ? `Vai trò ${r.name}` : "Vai trò"}>
        {r && buddy && (
          <div className="space-y-6">
            <div className="oh-arch h-44" style={{ background: buddy.tint }}>
              <Mascot mascot={r.mascot} presence={presence} size={120} agentBadge={status?.updatedBy === "agent"} title={`${r.name}, ${PRESENCE_LABEL_VI[presence].toLowerCase()}`} />
            </div>
            <div>
              <h3 className="text-oh-2xl font-bold">{r.name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge presence={presence} />
                <Badge>Đợt {r.wave}</Badge>
                <Badge><code>{r.key}</code></Badge>
              </div>
              <p className="mt-3 text-oh-sm">{r.mission || <span className="text-oh-ink-muted">Chưa ghi nhiệm vụ.</span>}</p>
            </div>

            <section aria-labelledby="card-h" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id="card-h" className="text-oh-base font-semibold">Thẻ trạng thái</h3>
                {editing !== "status" && <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing("status")}>Đặt tay</Button>}
              </div>
              {editing === "status" ? (
                <StatusForm key={r.id} role={r} board={board} onDone={() => setEditing(null)} />
              ) : (
                <dl className="space-y-3 rounded-oh-lg bg-oh-surface-2 p-4 text-oh-sm">
                  <Row label="Đang làm gì">{status?.doing ?? "Chưa có cập nhật."}</Row>
                  <Row label="Nhánh">{status?.branch ? <code className="font-mono text-oh-xs">{status.branch}</code> : "—"}</Row>
                  <Row label="File đang sửa">
                    {status?.paths.length ? (
                      <ul className="mt-0.5 space-y-1">
                        {status.paths.map((p) => {
                          const o = out.find((x) => x.path === p);
                          return (
                            <li key={p} className="flex flex-wrap items-center gap-1.5">
                              <code className="break-all font-mono text-oh-xs">{p}</code>
                              {o && (
                                <Badge tone="warning" icon="alert">
                                  Ngoài vùng · {o.owner ? `của ${o.owner.name}` : "chưa ai sở hữu"}
                                </Badge>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      "Không có."
                    )}
                  </Row>
                  <Row label="Đang chờ">{waiting.length ? waiting.join(", ") : "Không chờ ai."}</Row>
                  {status && (
                    <p className="text-oh-xs text-oh-ink-muted">
                      Cập nhật {relativeTimeVi(status.updatedAt)} · {status.updatedBy === "agent" ? "agent của vai trò" : "bạn đặt tay"}
                    </p>
                  )}
                </dl>
              )}
            </section>

            <section aria-labelledby="area-h" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id="area-h" className="text-oh-base font-semibold">Vùng sở hữu</h3>
                {editing !== "role" && <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing("role")}>Sửa vai trò</Button>}
              </div>
              {editing === "role" ? (
                <RoleForm key={r.id} role={r} onDone={() => setEditing(null)} />
              ) : (
                <div className="space-y-2 text-oh-sm">
                  <ul className="flex flex-wrap gap-1.5" aria-label="Đường dẫn được ghi">
                    {r.ownedPaths.map((p) => (
                      <li key={p}><code className="rounded-oh-sm bg-oh-surface-2 px-1.5 py-0.5 font-mono text-oh-xs">{p}</code></li>
                    ))}
                    {r.ownedPaths.length === 0 && <li className="text-oh-ink-muted">Chưa có đường dẫn nào.</li>}
                  </ul>
                  <p className="text-oh-xs text-oh-ink-muted">
                    Bàn giao: {r.handoffPath ? <code className="font-mono">{r.handoffPath}</code> : "chưa đặt"}
                  </p>
                </div>
              )}
            </section>

            <section aria-labelledby="agents-h" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id="agents-h" className="text-oh-base font-semibold">Agent giữ vai trò</h3>
                <Button size="sm" variant="secondary" icon="key" onClick={() => setDialog("token")}>Tạo token</Button>
              </div>
              {revealed && <RevealPanel data={revealed} role={r} onDone={() => setRevealed(null)} />}
              {!agents.data ? (
                <p className="text-oh-sm text-oh-ink-muted">Đang tải…</p>
              ) : mine.length === 0 ? (
                <p className="text-oh-sm text-oh-ink-muted">Chưa có agent nào. Tạo token để một phiên Claude Code giữ vai trò này.</p>
              ) : (
                <ul className="space-y-2">
                  {mine.map((a) => (
                    <AgentRow key={a.id} agent={a} compact onRevoke={() => setRevoking(a)} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="open-h">
              <h3 id="open-h" className="mb-2 text-oh-base font-semibold">Yêu cầu đang mở</h3>
              {open.length === 0 ? (
                <p className="text-oh-sm text-oh-ink-muted">Không có.</p>
              ) : (
                <ul>
                  {open.map((x) => (
                    <li key={x.id} className="border-b border-oh-border last:border-0">
                      <Link href={`/w/${slug}/requests/${x.id}`} className="flex items-center justify-between gap-2 py-2.5 text-oh-sm hover:text-oh-primary focus-visible:outline-3 focus-visible:outline-oh-focus">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{x.title}</span>
                          <small className="flex items-center gap-1.5 text-oh-xs text-oh-ink-muted">
                            {directionLabel(x, roles)} <KindChip kind={x.kind} />
                          </small>
                        </span>
                        <Icon name="chevron" size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Button variant="primary" icon="request" className="w-full" onClick={() => setDialog("assign")}>
              Giao việc cho {r.name}
            </Button>
          </div>
        )}
      </Drawer>
      {r && (
        <>
          <NewRequestDialog open={dialog === "assign"} onClose={() => setDialog(null)} slug={slug} roles={board.roles} tasks={board.tasks} defaultRoleId={r.id} />
          <AddAgentDialog
            open={dialog === "token"}
            onClose={() => setDialog(null)}
            slug={slug}
            roles={board.roles}
            defaultRoleId={r.id}
            onCreated={(res) => {
              setDialog(null);
              setRevealed(res);
            }}
          />
        </>
      )}
      <RevokeDialog agent={revoking} slug={slug} onClose={() => setRevoking(null)} />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-oh-xs font-semibold text-oh-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const { slug } = useWorkspace();
  const toast = useToast();
  const update = useUpdateRole(slug);
  const [mission, setMission] = useState(role.mission);
  const [paths, setPaths] = useState<string[]>(role.ownedPaths);
  const [adding, setAdding] = useState("");
  const [handoff, setHandoff] = useState(role.handoffPath ?? "");
  const [wave, setWave] = useState(String(role.wave));
  const add = () => {
    const p = adding.trim();
    if (p && !paths.includes(p)) setPaths([...paths, p]);
    setAdding("");
  };
  const save = () =>
    update.mutate(
      { id: role.id, input: { mission: mission.trim(), ownedPaths: paths, handoffPath: handoff.trim() || null, wave: Number(wave) } },
      {
        onSuccess: () => {
          toast(`Đã lưu vai trò ${role.name}.`, "success");
          onDone();
        },
        onError: (e) => toast(errorMessage(e), "danger"),
      },
    );
  return (
    <form
      className="space-y-4 rounded-oh-lg border border-oh-primary p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Nhiệm vụ">{(id) => <TextArea id={id} rows={3} maxLength={500} value={mission} onChange={(e) => setMission(e.target.value)} />}</Field>
      <fieldset className="space-y-2">
        <legend className="text-oh-sm font-medium">Đường dẫn được ghi (glob)</legend>
        <ul className="space-y-1.5">
          {paths.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-oh-sm bg-oh-surface-2 px-2 py-1 font-mono text-oh-xs">{p}</code>
              <Button size="sm" variant="ghost" icon="close" aria-label={`Bỏ ${p}`} onClick={() => setPaths(paths.filter((x) => x !== p))} />
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <TextInput
            aria-label="Thêm đường dẫn"
            placeholder="ví dụ apps/web/**"
            maxLength={200}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="font-mono text-oh-sm"
          />
          <Button icon="plus" onClick={add} disabled={!adding.trim()}>Thêm</Button>
        </div>
        <p className="text-oh-xs text-oh-ink-muted"><code>*</code> một cấp thư mục, <code>**</code> mọi cấp.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <Field label="File bàn giao">{(id) => <TextInput id={id} maxLength={200} value={handoff} onChange={(e) => setHandoff(e.target.value)} className="font-mono text-oh-sm" />}</Field>
        <Field label="Đợt">{(id) => <TextInput id={id} type="number" min={0} max={9} value={wave} onChange={(e) => setWave(e.target.value)} />}</Field>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>Thôi</Button>
        <Button type="submit" variant="primary" icon="check" loading={update.isPending}>Lưu vai trò</Button>
      </div>
    </form>
  );
}

function StatusForm({ role, board, onDone }: { role: Role; board: Board; onDone: () => void }) {
  const { slug } = useWorkspace();
  const toast = useToast();
  const update = useUpdateRoleStatus(slug);
  const cur = cardOf(board, role.id);
  const [presence, setPresence] = useState<PresenceState>(cur?.presence ?? "idle");
  const [doing, setDoing] = useState(cur?.doing ?? "");
  const [branch, setBranch] = useState(cur?.branch ?? "");
  const [waitingOn, setWaitingOn] = useState<string[]>(cur?.waitingOn ?? []);
  const others = board.roles.filter((r) => r.id !== role.id);
  const save = () =>
    update.mutate(
      { id: role.id, input: { presence, doing: doing.trim() || null, branch: branch.trim() || null, waitingOn } },
      {
        onSuccess: () => {
          toast(`Đã cập nhật thẻ ${role.name}.`, "success");
          onDone();
        },
        onError: (e) => toast(errorMessage(e), "danger"),
      },
    );
  return (
    <form
      className="space-y-4 rounded-oh-lg border border-oh-primary p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Trạng thái">
        {(id) => (
          <Select id={id} value={presence} onChange={(e) => setPresence(e.target.value as PresenceState)}>
            {PresenceState.options.map((p) => (
              <option key={p} value={p}>{PRESENCE_LABEL_VI[p]}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Đang làm gì">{(id) => <TextInput id={id} maxLength={280} value={doing} onChange={(e) => setDoing(e.target.value)} />}</Field>
      <Field label="Nhánh">{(id) => <TextInput id={id} maxLength={200} value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono text-oh-sm" />}</Field>
      <fieldset>
        <legend className="mb-1.5 text-oh-sm font-medium">Đang chờ vai trò</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {others.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-oh-sm">
              <input type="checkbox" className="size-4" checked={waitingOn.includes(r.id)} onChange={() => setWaitingOn(waitingOn.includes(r.id) ? waitingOn.filter((x) => x !== r.id) : [...waitingOn, r.id])} />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-oh-xs text-oh-ink-muted">File đang sửa giữ nguyên; agent của vai trò báo qua post_status.</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>Thôi</Button>
        <Button type="submit" variant="primary" icon="check" loading={update.isPending}>Lưu thẻ</Button>
      </div>
    </form>
  );
}
