import { listenChannel } from "@officehub/db";

export type ChangeMsg = { workspaceId: string; kind: string; id: string };
type Sub = (m: ChangeMsg) => void;

/** One dedicated Postgres connection LISTENing on officehub_changes, fanned out per workspace. */
export class ChangeHub {
  private subs = new Map<string, Set<Sub>>();
  private closer?: () => Promise<void>;
  private starting?: Promise<void>;

  start(): Promise<void> {
    return (this.starting ??= listenChannel("officehub_changes", (payload) => {
      try {
        const m = JSON.parse(payload) as ChangeMsg;
        for (const s of this.subs.get(m.workspaceId) ?? []) s(m); // ONLY the caller's workspace
      } catch {
        /* ignore malformed */
      }
    }).then((close) => {
      this.closer = close;
    }));
  }

  subscribe(workspaceId: string, fn: Sub): () => void {
    const set = this.subs.get(workspaceId) ?? new Set<Sub>();
    set.add(fn);
    this.subs.set(workspaceId, set);
    return () => set.delete(fn);
  }

  async stop(): Promise<void> {
    await this.closer?.();
  }
}
