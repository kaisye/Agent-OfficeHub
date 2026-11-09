import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { getConnInfo } from "@hono/node-server/conninfo";
import { askAssistant } from "./assistant.js";
import { ZodError, type z } from "zod";
import { ChangeMessage as ChangeMessageSchema, Id, Routes } from "@officehub/shared";
import {
  HubError,
  actOnRequest,
  audit,
  auditStandalone,
  authenticateAgent,
  authenticateSession,
  bearer,
  buildHandoff,
  createAgent,
  createRequestDraft,
  createSession,
  destroySession,
  ingestGithub,
  listAudit,
  listDecisions,
  listInbox,
  markRead,
  canViewRequest,
  listMyAgents,
  listRequests,
  looksLikeAgentToken,
  mapMember,
  membersByGithub,
  memberById,
  recordDecision,
  revokeAgent,
  getBoard,
  getRequest,
  devMembers,
  updateOwnMascot,
  updateOwnStatus,
  verifyGithubSignature,
  wrapInbox,
  workspaceBySlug,
  withWorkspace,
  actorOf,
  type Principal,
  acceptInvite,
  changePassword,
  createInvite,
  hashToken,
  inviteInfo,
  passwordLogin,
  takeToken,
} from "@officehub/db";
import { loadConfig, type ApiConfig } from "./config.js";
import { ChangeHub } from "./sse.js";

type Human = Extract<Principal, { kind: "human" }>;
type Agent = Extract<Principal, { kind: "agent" }>;
type Env = { Variables: { human: Human; agent: Agent; audited: boolean } };

export const SESSION_COOKIE = "oh_session";
export const CSRF_HEADER = "x-officehub-csrf";

export interface AppHandle {
  app: Hono<Env>;
  hub: ChangeHub;
  config: ApiConfig;
}

async function parseBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HubError("validation_failed", "Body must be valid JSON", 400);
  }
  const r = schema.safeParse(json);
  if (!r.success) throw invalid(r.error);
  return r.data;
}
const invalid = (e: ZodError) =>
  new HubError("validation_failed", e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 400);
const uuidParam = (c: Context, name: string) => {
  const r = Id.safeParse(c.req.param(name));
  if (!r.success) throw new HubError("not_found", "Not found", 404);
  return r.data;
};

const sign = (secret: string, v: string) => createHmac("sha256", secret).update(v).digest("base64url");

export function createApp(over: Partial<ApiConfig> = {}): AppHandle {
  const config = loadConfig(over);
  const hub = new ChangeHub();
  const app = new Hono<Env>();
  const secureCookie = config.webOrigin.startsWith("https://");

  app.use(
    "*",
    cors({
      origin: config.webOrigin,
      credentials: true,
      allowHeaders: ["content-type", CSRF_HEADER],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );
  app.use("*", bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: { code: "validation_failed", message: "Body too large" } }, 400) }));

  app.onError((err, c) => {
    if (err instanceof HubError) {
      if (err.code === "secret_detected") c.set("audited", true);
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    if (err instanceof ZodError) {
      const e = invalid(err);
      return c.json({ error: { code: e.code, message: e.message } }, 400);
    }
    console.error("unhandled", err);
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  const isAgentPath = (p: string) => p.startsWith("/agent/");
  const isHookPath = (p: string) => p.startsWith("/hooks/");

  // Rule 3/5: bearer (agent) credentials are never accepted on human routes — even if a cookie is also present.
  app.use("*", async (c, next) => {
    const p = c.req.path;
    if (isAgentPath(p) || isHookPath(p) || c.req.path === "/health") return next();
    const auth = c.req.header("authorization");
    if (auth) {
      const t = bearer(auth);
      if (looksLikeAgentToken(t) || t) {
        // Best-effort audit when we can attribute the attempt to a workspace.
        if (looksLikeAgentToken(t)) {
          const a = await authenticateAgent(t).catch(() => null);
          if (a?.ok) {
            await auditStandalone(a.principal.workspaceId, actorOf(a.principal), { action: "human_route.rejected", outcome: "human_only", meta: { method: c.req.method, path: p } }).catch(() => {});
          }
        }
        throw new HubError("human_only", "This route requires a signed-in human session; agent tokens are not accepted", 403);
      }
    }
    return next();
  });

  // CSRF: state-changing cookie-authenticated routes need a custom header (forces a CORS preflight, which only WEB_ORIGIN passes)
  // AND, when the browser sends one, an Origin equal to WEB_ORIGIN.
  app.use("*", async (c, next) => {
    const m = c.req.method;
    if (m === "GET" || m === "HEAD" || m === "OPTIONS" || isAgentPath(c.req.path) || isHookPath(c.req.path)) return next();
    if (c.req.header(CSRF_HEADER) !== "1") throw new HubError("csrf_failed", `Missing ${CSRF_HEADER}: 1 header`, 403);
    const origin = c.req.header("origin");
    if (origin && origin !== config.webOrigin) throw new HubError("csrf_failed", "Origin not allowed", 403);
    return next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  /* ---------------- human auth ---------------- */
  async function startSession(c: Context, workspaceId: string, memberId: string) {
    const s = await createSession(workspaceId, memberId);
    setCookie(c, SESSION_COOKIE, s.token, { httpOnly: true, sameSite: "Lax", secure: secureCookie, path: "/", expires: s.expiresAt });
  }
  async function meBody(h: Human) {
    return withWorkspace(h.workspaceId, async (tx) => {
      const [m] = await tx`SELECT * FROM members WHERE id = ${h.memberId}`;
      const [w] = await tx`SELECT slug, name FROM workspaces WHERE id = ${h.workspaceId}`;
      // Member shape + extras the web app needs (workspaceSlug, workspaceName).
      return { ...mapMember(m!), workspaceSlug: w!.slug as string, workspaceName: w!.name as string };
    });
  }

  app.post("/auth/dev-login", async (c) => {
    if (!config.devLoginEnabled) throw new HubError("not_found", "Not found", 404);
    const { memberId } = await parseBody(c, Routes.devLogin.body);
    const m = await memberById(memberId);
    if (!m) throw new HubError("not_found", "No such member", 404);
    await startSession(c, m.workspaceId, m.id);
    await auditStandalone(m.workspaceId, { kind: "human", memberId: m.id }, { action: "auth.dev_login" });
    return c.json(await meBody({ kind: "human", workspaceId: m.workspaceId, memberId: m.id, role: m.role }));
  });

  /* ---------------- password login via invite links (v0.5) ---------------- */
  const clientIp = (c: Context) => {
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  };
  async function throttle(key: string, capacity: number, perMinute: number) {
    const wait = await takeToken(key, capacity, perMinute);
    if (wait) throw new HubError("rate_limited", `Thử lại sau ${wait} giây`, 429);
  }

  app.post("/auth/login", async (c) => {
    const { email, password } = await parseBody(c, Routes.passwordLogin.body);
    await throttle(`login:ip:${clientIp(c)}`, 10, 10); // 10/min per IP
    await throttle(`login:email:${email}`, 5, 1 / 3); // 5 tries, then 1 per 3 min per email
    const h = await passwordLogin(email, password);
    await startSession(c, h.workspaceId, h.memberId);
    return c.json(await meBody({ kind: "human", ...h }));
  });

  app.get("/auth/invite/:token", async (c) => {
    await throttle(`invite:ip:${clientIp(c)}`, 20, 10);
    return c.json(await inviteInfo(c.req.param("token")));
  });

  app.post("/auth/invite/accept", async (c) => {
    const { token, email, password } = await parseBody(c, Routes.acceptInvite.body);
    await throttle(`invite:ip:${clientIp(c)}`, 20, 10);
    const m = await acceptInvite(token, email, password);
    await startSession(c, m.workspaceId, m.id);
    return c.json(await meBody({ kind: "human", workspaceId: m.workspaceId, memberId: m.id, role: m.role }));
  });

  // Dev login picker: only when DEV_LOGIN_ENABLED=true (otherwise indistinguishable from an unknown route).
  app.get("/auth/dev-members", async (c) => {
    if (!config.devLoginEnabled) throw new HubError("not_found", "Not found", 404);
    return c.json(await devMembers());
  });

  app.get("/auth/github", (c) => {
    if (!config.githubClientId) throw new HubError("internal", "GitHub OAuth is not configured (GITHUB_CLIENT_ID)", 500);
    const state = crypto.randomUUID();
    setCookie(c, "oh_oauth_state", `${state}.${sign(config.sessionSecret, state)}`, { httpOnly: true, sameSite: "Lax", secure: secureCookie, path: "/auth", maxAge: 600 });
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", config.githubClientId);
    u.searchParams.set("scope", "read:user");
    u.searchParams.set("state", state);
    return c.redirect(u.toString(), 302);
  });

  app.get("/auth/github/callback", async (c) => {
    if (!config.githubClientId) throw new HubError("internal", "GitHub OAuth is not configured", 500);
    const [state, mac] = (getCookie(c, "oh_oauth_state") ?? "").split(".");
    const given = c.req.query("state");
    const code = c.req.query("code");
    const ok =
      state && mac && given === state && mac.length === sign(config.sessionSecret, state).length &&
      timingSafeEqual(Buffer.from(mac), Buffer.from(sign(config.sessionSecret, state)));
    deleteCookie(c, "oh_oauth_state", { path: "/auth" });
    if (!ok || !code) throw new HubError("validation_failed", "Invalid OAuth state", 400);
    const tok = (await (
      await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code }),
      })
    ).json()) as { access_token?: string };
    if (!tok.access_token) throw new HubError("validation_failed", "GitHub rejected the code", 400);
    const gh = (await (await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${tok.access_token}`, "user-agent": "office-hub" } })).json()) as { login?: string };
    if (!gh.login) throw new HubError("validation_failed", "Could not read GitHub user", 400);
    const members = await membersByGithub(gh.login);
    const m = members[0];
    if (!m) return c.redirect(`${config.webOrigin}/login?error=not_a_member`, 302);
    await startSession(c, m.workspaceId, m.id);
    const w = await withWorkspace(m.workspaceId, async (tx) => (await tx`SELECT slug FROM workspaces`)[0]);
    await auditStandalone(m.workspaceId, { kind: "human", memberId: m.id }, { action: "auth.github_login" });
    return c.redirect(`${config.webOrigin}/w/${w!.slug}`, 302);
  });

  async function humanFromCookie(c: Context): Promise<Human> {
    const tok = getCookie(c, SESSION_COOKIE);
    const h = tok ? await authenticateSession(tok) : null;
    if (!h) throw new HubError("unauthenticated", "Sign in required", 401);
    return h;
  }

  app.get("/me", async (c) => {
    const h = await humanFromCookie(c);
    return c.json(await meBody(h));
  });

  app.post("/auth/logout", async (c) => {
    const tok = getCookie(c, SESSION_COOKIE);
    const h = tok ? await authenticateSession(tok) : null;
    if (h && tok) {
      await destroySession(h.workspaceId, tok);
      await auditStandalone(h.workspaceId, actorOf(h), { action: "auth.logout" });
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  /* ---------------- /w/:slug human routes ---------------- */
  app.use("/w/:slug/*", async (c, next) => {
    const h = await humanFromCookie(c);
    const ws = await workspaceBySlug(c.req.param("slug")!);
    if (!ws || ws.id !== h.workspaceId) throw new HubError("not_found", "Workspace not found", 404);
    c.set("human", h);
    await next();
    // Audit every human read here; writes are audited by the services (+ failures below).
    const status = c.res.status;
    if (c.req.method === "GET" && status < 400) {
      await withWorkspace(h.workspaceId, (tx) => audit(tx, h.workspaceId, actorOf(h), { action: `read ${c.req.routePath}`, meta: { path: c.req.path } })).catch((e) => console.error("audit", e));
    } else if (c.req.method !== "GET" && status >= 400 && !c.get("audited")) {
      await withWorkspace(h.workspaceId, (tx) => audit(tx, h.workspaceId, actorOf(h), { action: `${c.req.method} ${c.req.routePath}`, outcome: `http_${status}` })).catch((e) => console.error("audit", e));
    }
  });
  const H = (c: Context) => c.get("human") as Human;

  app.get("/w/:slug/board", async (c) => c.json(await getBoard(H(c))));

  app.post("/w/:slug/assistant", async (c) => {
    const { question, history } = await parseBody(c, Routes.askAssistant.body);
    const h = H(c);
    const out = await askAssistant(h, question, history);
    await auditStandalone(h.workspaceId, actorOf(h), { action: "assistant.ask", meta: { tools: out.toolsUsed } }).catch(() => {});
    return c.json(out);
  });

  app.post("/w/:slug/members/:id/invite", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw new HubError("validation_failed", "Bad member id", 400);
    return c.json(await createInvite(H(c), id.data, config.webOrigin));
  });

  app.post("/w/:slug/me/password", async (c) => {
    const { current, next } = await parseBody(c, Routes.changePassword.body);
    await changePassword(H(c), current, next, hashToken(getCookie(c, SESSION_COOKIE) ?? ""));
    return c.json({ ok: true as const });
  });

  app.get("/w/:slug/stream", (c) => {
    const h = H(c);
    return streamSSE(c, async (stream) => {
      await hub.start();
      const queue: z.infer<typeof ChangeMessageSchema>[] = [];
      let wake: (() => void) | null = null;
      const off = hub.subscribe(h.workspaceId, (m) => {
        const parsed = ChangeMessageSchema.safeParse({ kind: m.kind, id: m.id }); // kinds are exactly ChangeKind
        if (!parsed.success) return;
        const push = () => {
          queue.push(parsed.data);
          wake?.();
        };
        // C13: never leak the existence of requests (or their events) the viewer cannot see.
        if (m.kind === "request") void canViewRequest(h, m.id).then((ok) => ok && push());
        else if (m.kind === "event") {
          void withWorkspace(h.workspaceId, async (tx) => (await tx`SELECT type, data FROM events WHERE id = ${m.id}`)[0])
            .then(async (e) => {
              if (!e) return;
              if (!String(e.type).startsWith("request.")) return push();
              if (typeof e.data?.requestId === "string" && (await canViewRequest(h, e.data.requestId))) push();
            })
            .catch(() => {});
        } else push();
      });
      let closed = false;
      stream.onAbort(() => {
        closed = true;
        off();
        wake?.();
      });
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!closed) {
        while (queue.length) await stream.writeSSE({ event: "change", data: JSON.stringify(queue.shift()) });
        await Promise.race([new Promise<void>((r) => (wake = r)), new Promise((r) => setTimeout(r, 25000))]);
        wake = null;
        if (!closed && !queue.length) await stream.writeSSE({ event: "ping", data: "{}" });
      }
    });
  });

  app.put("/w/:slug/status", async (c) => {
    const body = await parseBody(c, Routes.updateMyStatus.body);
    return c.json(await updateOwnStatus(H(c), body));
  });
  app.put("/w/:slug/me/mascot", async (c) => {
    const body = await parseBody(c, Routes.updateMyMascot.body);
    return c.json(await updateOwnMascot(H(c), body));
  });

  app.get("/w/:slug/requests", async (c) => c.json(await listRequests(H(c))));
  app.get("/w/:slug/requests/:id", async (c) => c.json(await getRequest(H(c), uuidParam(c, "id"))));
  app.get("/w/:slug/inbox", async (c) => c.json(await listInbox(H(c), { actionOnly: true })));
  app.post("/w/:slug/requests/:id/read", async (c) => {
    await markRead(H(c), uuidParam(c, "id"));
    return c.json({ ok: true });
  });
  app.post("/w/:slug/requests", async (c) => {
    const body = await parseBody(c, Routes.createRequest.body);
    return c.json(await createRequestDraft(H(c), body), 201);
  });
  app.post("/w/:slug/requests/:id/actions", async (c) => {
    const id = uuidParam(c, "id");
    const body = await parseBody(c, Routes.actOnRequest.body);
    return c.json(await actOnRequest(H(c), id, body.action, body.body));
  });

  app.get("/w/:slug/decisions", async (c) => c.json(await listDecisions(H(c))));
  app.post("/w/:slug/decisions", async (c) => {
    const body = await parseBody(c, Routes.recordDecision.body);
    return c.json(await recordDecision(H(c), body), 201);
  });

  app.get("/w/:slug/agents", async (c) => c.json(await listMyAgents(H(c))));
  app.post("/w/:slug/agents", async (c) => {
    const body = await parseBody(c, Routes.createAgent.body);
    return c.json(await createAgent(H(c), body), 201);
  });
  app.delete("/w/:slug/agents/:id", async (c) => {
    return c.json(await revokeAgent(H(c), uuidParam(c, "id")));
  });

  app.get("/w/:slug/tasks/:id/handoff", async (c) => c.json(await buildHandoff(H(c), uuidParam(c, "id"))));
  app.get("/w/:slug/audit", async (c) => c.json(await listAudit(H(c))));

  /* ---------------- /agent/* (bearer agent token ONLY) ---------------- */
  app.use("/agent/*", async (c, next) => {
    const t = bearer(c.req.header("authorization"));
    if (!looksLikeAgentToken(t)) throw new HubError("unauthenticated", "Bearer agent token required", 401);
    const a = await authenticateAgent(t);
    if (!a.ok) {
      if (a.reason === "revoked" && a.workspaceId)
        await auditStandalone(a.workspaceId, { kind: "agent", agentId: a.agentId!, memberId: a.ownerId! }, { action: "auth.rejected", outcome: "token_revoked" }).catch(() => {});
      throw new HubError(a.reason === "revoked" ? "token_revoked" : "unauthenticated", a.reason === "revoked" ? "Token has been revoked" : "Unknown token", 401);
    }
    const wait = await config.limiter.check(a.principal.agentId, "any");
    if (wait) {
      c.header("Retry-After", String(wait));
      throw new HubError("rate_limited", `Too many requests; retry in ${wait}s`, 429);
    }
    c.set("agent", a.principal);
    await next();
  });

  // Lightweight endpoint for hooks (Claude Code SessionStart / UserPromptSubmit): unread inbox, wrapped as untrusted.
  app.get("/agent/inbox", async (c) => {
    const a = c.get("agent");
    const items = await listInbox(a, { unreadOnly: c.req.query("unread") === "1", markRead: c.req.query("mark") === "1" });
    await withWorkspace(a.workspaceId, (tx) => audit(tx, a.workspaceId, actorOf(a), { action: "agent.inbox", via: "api", meta: { count: items.length } }));
    return c.json(wrapInbox(a.ownerId, items));
  });

  /* ---------------- webhooks ---------------- */
  app.post("/hooks/github/:workspaceId", async (c) => {
    const wsId = Id.safeParse(c.req.param("workspaceId"));
    if (!wsId.success) throw new HubError("not_found", "Not found", 404);
    if (!config.githubWebhookSecret) throw new HubError("internal", "GITHUB_WEBHOOK_SECRET is not set", 500);
    const raw = await c.req.text();
    if (!verifyGithubSignature(config.githubWebhookSecret, raw, c.req.header("x-hub-signature-256"))) {
      await auditStandalone(wsId.data, { kind: "webhook" }, { action: "webhook.github", outcome: "bad_signature" }).catch(() => {});
      throw new HubError("bad_signature", "Signature mismatch", 401);
    }
    const event = c.req.header("x-github-event") ?? "";
    if (event === "ping") return c.json({ ok: true, pong: true });
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HubError("validation_failed", "Body must be JSON", 400);
    }
    const exists = await withWorkspace(wsId.data, async (tx) => (await tx`SELECT id FROM workspaces`).length);
    if (!exists) throw new HubError("not_found", "Workspace not found", 404);
    const r = await ingestGithub(wsId.data, event, c.req.header("x-github-delivery") ?? null, payload);
    return c.json({ ok: true, ...r });
  });

  return { app, hub, config };
}
