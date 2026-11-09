/**
 * Overdue reminders. NEVER auto-closes anything: emits `request.reminded` (+ audit) at the due time and then once per
 * 24 WORKING hours (Mon–Fri 09:00–12:00 and 13:00–18:00, UTC+7) until the request is resolved.
 */
import { appSql, withWorkspace } from "./client.js";
import { audit, emitEvent } from "./core.js";

const TZ_OFFSET_MIN = 7 * 60;

/** Working minutes between a and b (UTC+7, Mon–Fri 09–12, 13–18). Minute-stepped in 5-min slices; fine for days-scale gaps. */
export function workingMinutesBetween(a: Date, b: Date): number {
  let n = 0;
  const STEP = 5 * 60000;
  for (let t = a.getTime(); t < b.getTime(); t += STEP) {
    const local = new Date(t + TZ_OFFSET_MIN * 60000);
    const dow = local.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const h = local.getUTCHours() + local.getUTCMinutes() / 60;
    if ((h >= 9 && h < 12) || (h >= 13 && h < 18)) n += 5;
  }
  return n;
}

export const REMINDER_INTERVAL_WORKING_MIN = 24 * 60;

/** Run one pass. Returns how many reminders were emitted. */
export async function runReminders(now: Date = new Date()): Promise<number> {
  const due = await appSql()`SELECT id, workspace_id, due_at FROM auth_due_requests()`;
  let sent = 0;
  for (const r of due) {
    await withWorkspace(r.workspace_id, async (tx) => {
      const last = (await tx`SELECT max(time) AS t FROM events WHERE type = 'request.reminded' AND data->>'requestId' = ${r.id}`)[0]?.t as Date | null;
      const since = last ? new Date(last) : null;
      // first reminder at due time; then every 24 working hours since the previous reminder
      if (since && workingMinutesBetween(since, now) < REMINDER_INTERVAL_WORKING_MIN) return;
      const [req] = await tx`SELECT task_id FROM requests WHERE id = ${r.id}`;
      await emitEvent(tx, null, r.workspace_id, "request.reminded", { requestId: r.id }, { taskId: req?.task_id ?? null, time: now });
      await audit(tx, r.workspace_id, { kind: "system" }, { action: "request.remind", targetKind: "request", targetId: r.id });
      sent++;
    });
  }
  return sent;
}
