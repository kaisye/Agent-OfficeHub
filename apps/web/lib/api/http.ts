import { ApiErrorCode, ChangeMessage, Routes, type Id } from "@officehub/shared";
import { ApiClientError, type ApiClient, type ChangeEvent } from "./types";

type RouteDef = { method: string; path: string };

function fill(path: string, params: Record<string, string>) {
  return path.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  eventSourceImpl?: typeof EventSource;
}

/** Real API client: cookie session, CSRF header on writes, `{error:{code,message}}` parsed into ApiClientError. */
export function createHttpClient(opts: HttpClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/$/, "");
  const doFetch: typeof fetch = (...a) => (opts.fetchImpl ?? fetch)(...a);

  async function call<T>(route: RouteDef, params: Record<string, string> = {}, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (route.method !== "GET") headers["X-OfficeHub-CSRF"] = "1";
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await doFetch(base + fill(route.path, params), {
        method: route.method,
        credentials: "include",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiClientError("network", "Chưa kết nối được. Thử lại sau nhé.");
    }
    if (!res.ok) {
      let code: ApiClientError["code"] = "internal";
      let message = `Lỗi ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { code?: string; message?: string } };
        const parsed = ApiErrorCode.safeParse(j.error?.code);
        if (parsed.success) code = parsed.data;
        if (j.error?.message) message = j.error.message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiClientError(code, message, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const w = (slug: string, extra: Record<string, string> = {}) => ({ slug, ...extra });

  return {
    mode: "http",
    me: () => call(Routes.me),
    devMembers: (workspace) => call({ ...Routes.devMembers, path: `${Routes.devMembers.path}?workspace=${encodeURIComponent(workspace)}` }),
    devLogin: async (memberId) => void (await call(Routes.devLogin, {}, { memberId })),
    githubLoginUrl: () => base + Routes.githubLogin.path,
    logout: async () => void (await call(Routes.logout)),
    passwordLogin: async (email, password) => void (await call(Routes.passwordLogin, {}, { email, password })),
    inviteInfo: (token) => call(Routes.inviteInfo, { token }),
    acceptInvite: async (input) => void (await call(Routes.acceptInvite, {}, input)),
    inviteMember: (slug, memberId) => call(Routes.inviteMember, w(slug, { id: memberId }), {}),
    changePassword: async (slug, input) => void (await call(Routes.changePassword, w(slug), input)),
    board: (slug) => call(Routes.board, w(slug)),
    updateMyStatus: async (slug, input) => void (await call(Routes.updateMyStatus, w(slug), input)),
    updateMyMascot: async (slug, input) => void (await call(Routes.updateMyMascot, w(slug), input)),
    listRequests: (slug) => call(Routes.listRequests, w(slug)),
    createRequest: (slug, input) => call(Routes.createRequest, w(slug), input),
    actOnRequest: (slug, id, input) => call(Routes.actOnRequest, w(slug, { id }), input),
    getRequest: (slug, id) => call(Routes.getRequest, w(slug, { id })),
    inbox: (slug) => call(Routes.inbox, w(slug)),
    markRead: async (slug, id) => void (await call(Routes.markRead, w(slug, { id }))),
    listDecisions: (slug) => call(Routes.listDecisions, w(slug)),
    recordDecision: (slug, input) => call(Routes.recordDecision, w(slug), input),
    listMyAgents: (slug) => call(Routes.listMyAgents, w(slug)),
    createAgent: (slug, input) => call(Routes.createAgent, w(slug), input),
    revokeAgent: async (slug, id: Id) => void (await call(Routes.revokeAgent, w(slug, { id }))),
    handoff: (slug, id) => call(Routes.handoff, w(slug, { id })),
    subscribe(slug, onChange) {
      const ES = opts.eventSourceImpl ?? (typeof EventSource !== "undefined" ? EventSource : undefined);
      if (!ES) return () => {};
      const es = new ES(base + fill(Routes.stream.path, { slug }), { withCredentials: true });
      es.addEventListener("change", (ev) => {
        const parsed = (() => {
          try {
            return ChangeMessage.safeParse(JSON.parse((ev as MessageEvent<string>).data));
          } catch {
            return null;
          }
        })();
        // Unknown/malformed message: refresh everything rather than miss an update.
        onChange(parsed?.success ? { kind: parsed.data.kind, id: parsed.data.id } : ({ kind: "all", id: null } satisfies ChangeEvent));
      });
      return () => es.close();
    },
  };
}
