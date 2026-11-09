/**
 * Password login via one-time invite links (contract v0.5).
 * - Passwords: scrypt (N=2^15, r=8, p=1, 64-byte key, 16-byte salt), stored as "scrypt$N$r$p$salt$hash" (base64url).
 * - Invite links: 32 random bytes, only the sha256 is stored; single use (atomic UPDATE … WHERE used_at IS NULL); 48h.
 * - Unknown email and wrong password take the same path and the same time (dummy verify), same error.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { appSql, withWorkspace } from "./client.js";
import { audit, auditStandalone, mapMember, type Principal } from "./core.js";
import { HubError } from "./errors.js";
import { hashToken } from "./tokens.js";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const INVITE_TTL_MS = 48 * 3600 * 1000;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { ...opts, maxmem: 128 * N * R * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Burned on every miss so "no such email" costs the same as "wrong password". */
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(randomBytes(12).toString("hex")));

/* ---------------- invites ---------------- */

export async function createInvite(admin: Extract<Principal, { kind: "human" }>, memberId: string, webOrigin: string) {
  if (admin.role !== "admin") throw new HubError("forbidden", "Only workspace admins can invite", 403);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await withWorkspace(admin.workspaceId, async (tx) => {
    const [m] = await tx`SELECT id FROM members WHERE id = ${memberId}`;
    if (!m) throw new HubError("not_found", "No such member", 404);
    await tx`DELETE FROM invites WHERE member_id = ${memberId} AND used_at IS NULL`; // one live link per member
    await tx`INSERT INTO invites (workspace_id, member_id, token_hash, created_by, expires_at)
             VALUES (${admin.workspaceId}, ${memberId}, ${hashToken(token)}, ${admin.memberId}, ${expiresAt})`;
    await audit(tx, admin.workspaceId, { kind: "human", memberId: admin.memberId }, { action: "member.invite", targetKind: "member", targetId: memberId });
  });
  return { url: `${webOrigin.replace(/\/$/, "")}/invite/${token}`, expiresAt: expiresAt.toISOString() };
}

export async function inviteInfo(token: string) {
  const [i] = await appSql()`SELECT * FROM auth_invite_by_hash(${hashToken(token)})`;
  if (!i) throw new HubError("not_found", "Link mời không hợp lệ hoặc đã hết hạn", 404);
  return { displayName: i.display_name as string, workspaceName: i.workspace_name as string, mascot: i.mascot, email: (i.email as string | null) ?? null };
}

/** Sets email + password and burns the link. Returns the member to start a session for. */
export async function acceptInvite(token: string, email: string, password: string) {
  const [i] = await appSql()`SELECT * FROM auth_invite_by_hash(${hashToken(token)})`;
  if (!i) throw new HubError("not_found", "Link mời không hợp lệ hoặc đã hết hạn", 404);
  const hash = await hashPassword(password);
  const workspaceId = i.workspace_id as string;
  const memberId = i.member_id as string;
  try {
    return await withWorkspace(workspaceId, async (tx) => {
      const burned = await tx`UPDATE invites SET used_at = now() WHERE id = ${i.id} AND used_at IS NULL AND expires_at > now() RETURNING id`;
      if (burned.length === 0) throw new HubError("not_found", "Link mời đã được dùng", 404);
      await tx`UPDATE members SET email = ${email}, password_hash = ${hash} WHERE id = ${memberId}`;
      await tx`DELETE FROM sessions WHERE member_id = ${memberId}`; // a reset link signs out old sessions
      await audit(tx, workspaceId, { kind: "human", memberId }, { action: "auth.invite_accepted", targetKind: "member", targetId: memberId });
      const [m] = await tx`SELECT * FROM members WHERE id = ${memberId}`;
      return mapMember(m!);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HubError("validation_failed", "Email này đã được một thành viên khác dùng", 400);
    throw e;
  }
}

/* ---------------- login ---------------- */

export async function passwordLogin(email: string, password: string) {
  const [u] = await appSql()`SELECT * FROM auth_login_by_email(${email})`;
  const ok = u?.password_hash ? await verifyPassword(password, u.password_hash as string) : (await verifyPassword(password, await dummy()), false);
  if (!u || !ok) {
    if (u) await auditStandalone(u.workspace_id, { kind: "human", memberId: u.id }, { action: "auth.password_failed", outcome: "denied" }).catch(() => {});
    throw new HubError("unauthenticated", "Email hoặc mật khẩu không đúng", 401);
  }
  await auditStandalone(u.workspace_id, { kind: "human", memberId: u.id }, { action: "auth.password_login" });
  return { workspaceId: u.workspace_id as string, memberId: u.id as string, role: u.role as "admin" | "member" };
}

export async function changePassword(h: Extract<Principal, { kind: "human" }>, current: string, next: string, keepSessionHash: string) {
  const [u] = await withWorkspace(h.workspaceId, (tx) => tx`SELECT password_hash FROM members WHERE id = ${h.memberId}`);
  if (!u?.password_hash || !(await verifyPassword(current, u.password_hash as string))) {
    throw new HubError("unauthenticated", "Mật khẩu hiện tại không đúng", 401);
  }
  const hash = await hashPassword(next);
  await withWorkspace(h.workspaceId, async (tx) => {
    await tx`UPDATE members SET password_hash = ${hash} WHERE id = ${h.memberId}`;
    await tx`DELETE FROM sessions WHERE member_id = ${h.memberId} AND id_hash <> ${keepSessionHash}`;
    await audit(tx, h.workspaceId, { kind: "human", memberId: h.memberId }, { action: "auth.password_changed", targetKind: "member", targetId: h.memberId });
  });
}
