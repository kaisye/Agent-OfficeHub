# Frontend team — HANDOFF

## Built
Next.js 15.5 (App Router) + React 19 + Tailwind v4 wired per the Design HANDOFF, Vietnamese copy, light/dark (system + manual toggle in the user menu), responsive to 375px, keyboard accessible. Port 3000.

| Screen | Route | Stories |
|---|---|---|
| Đăng nhập (+ dev picker) | `/login`, `/dev-login?member=<id>[&next=..&theme=dark]` | ONB-01, ONB-02 |
| Văn phòng (board, needs-you, waiting strip, tasks, events, own status editor) | `/w/[slug]` | ONB-03, BRD-01..05, MAS-01, MAS-03, MAS-04 |
| Yêu cầu (tabs) + detail thread + "Tạo yêu cầu" | `/w/[slug]/requests`, `/requests/[id]` | REQ-01..11, REQ-14 (task link), NTF-01..05 (in-app badge/unread), AUD-01 (secret toast) |
| Quyết định (search, record) | `/w/[slug]/decisions` | DEC-01, DEC-02 |
| Agent của tôi (list, add, one-time token + snippets, revoke) | `/w/[slug]/agents` | AGT-01, 03, 08, 10 (snippet) |
| Mascot của tôi | `/w/[slug]/me/mascot` | MAS-02 |
| Bàn giao | `/w/[slug]/tasks/[id]` | HOF-01, HOF-02, BRD-05 |
| Global nav, inbox badge, skeletons, error boundary, not-found | | |

API client: `lib/api/` — one `ApiClient` interface, `http.ts` (cookies, `X-OfficeHub-CSRF: 1` on writes, `{error:{code,message}}` to `ApiClientError`, SSE `change`) and `mock.ts` (in-memory, seeded from `docs/business/seed-tripflix.json` with times shifted to "now"; enforces `canTransition`, `bodyRequirement`, `canSeeMessage`, human-only decisions, secret simulation `sk-`/`ghp_`/`AKIA`, emitter for SSE; `server.agent(id)` simulates MCP agent calls). TanStack Query hooks in `lib/hooks.ts`; a "change" event invalidates the affected queries.

## Run
```
pnpm install
pnpm --filter @officehub/web dev           # mock mode (default), http://localhost:3000
# open /login and pick a member, or /dev-login?member=<uuid>
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm --filter @officehub/web dev
```
Env: see `.env.example` (`NEXT_PUBLIC_API_MODE`, `_API_URL`, `_DEFAULT_WORKSPACE`, `_DEV_LOGIN`, `_MCP_URL`). Mock data resets on reload; only the session (member id) persists in localStorage.
Tests: `pnpm --filter @officehub/web test` (22 tests: mock rules + component interaction). Screenshots: `apps/web/screenshots/`.

## Round 2 (contract v0.3)
- Workspace slug now comes from `Me` (`/me`); `/` redirects to `/w/<me.workspaceSlug>`, a wrong slug in the URL is corrected. `NEXT_PUBLIC_DEFAULT_WORKSPACE` is only a mock-mode fallback (`FALLBACK_SLUG`).
- Login picker uses `Routes.devMembers` in http mode (mock: seed members via the mock client). `/dev-login` and login send you to `/` after sign-in.
- Request detail uses `getRequest` (`useRequest`, key `["request", slug, id]`).
- SSE: `ChangeMessage` is parsed with zod; kind -> queries in `keysForChange` (`lib/hooks.ts`); an unparseable message refreshes everything (`kind: "all"`).
- Requests list: the kit's inline composer clears itself on submit, so a rejected body (e.g. `secret_detected`) is kept in a "Chưa gửi được" panel under the card (editable, retry/dismiss).
- Token reveal: snippets live in `lib/agent-snippets.ts` only (`.mcp.json` with `${OFFICEHUB_AGENT_TOKEN}`, `export` line, hooks for SessionStart + UserPromptSubmit using `npx tsx /ABS/PATH/TO/apps/agent-hooks/src/cli.ts <event>`, from `docs/tech/agent-setup.md`). Edit `HOOK_COMMAND` there if Backend changes it.
- Board: own unsent drafts under "Nháp agent chờ bạn gửi" inside "Cần bạn xử lý"; presence changes play a pop/glow (`PulseOnChange`, `.oh-pulse`, disabled for reduced motion) on member cards and the "Ai đang chờ ai" strip. Checked at 1440/1024/768/390.
- Mock mode: "Giả lập đồng đội" button (board header; mock mode + `NEXT_PUBLIC_DEV_LOGIN`/dev builds) calls `MockServer.simulateTeammate`: a random other member changes presence or answers a request you asked.
- Merged Design round 2: removed the `--color-oh-surface-2` alias, `surface2` -> `surface-2`; RequestCard `detailHref`/`linkAs`; app icons (`app/icon.svg`, `app/apple-icon.png`); `Mascot decorative` next to visible names.
- Tests: 30 (added `test/round2.test.ts`). Screenshots in `screenshots/` (mock mode, port 3100).

## Workarounds kept until safe to delete
- `lib/use-stable.ts` / `useStableCallback` around Dialog `onClose` (agents, decisions, new request, action runner): harmless now that Dialog uses a ref; remove later.
- Local components that overlap kit candidates: thread in `request-detail.tsx`, `components/form.tsx`, top nav, tabs.
- "Chưa gửi được" panel in the requests list: obsolete if the kit's RequestCard keeps text when the action fails.
- `needsMe` adds own drafts from `board.openRequests` (inbox excludes them): keep unless Backend includes them.

## Known gaps
- Mock data is per tab and not shared across tabs; other users are simulated only through the dev button.
- No draft editing route exists, so "Sửa" sends the edited text with `send` / `send_reply` (body optional rule).
- Overdue reminder UI is the "Quá hạn" badge only (REQ-10 reminders are server-side). No P1/P2 stories (invites, filters, Jira, audit view, token rotation).
- Hook snippet path (`./apps/agent-hooks/dist/session-start.js`) and env names are assumptions.
- No e2e against the real API yet; http client is unit-untested beyond typing. Responses are not zod-validated at runtime.
- Screen reader testing not done.

## Requests
**Design (`packages/ui`, `packages/brand`)**
1. Theme names the token `oh-surface2` but the kit uses `bg-oh-surface-2` (8 places); web aliases it in `globals.css`. Rename one.
2. Components with hooks lack `"use client"`; importing `@officehub/ui` from a server component fails the build (web works around with client wrappers).
3. `Dialog` re-runs its focus effect whenever `onClose` changes (steals focus on each keystroke unless the callback is stable); web uses `useStableCallback`. Fix with a ref.
4. `TaskChip` key (`TRIP-42`) wraps mid-token in narrow spaces; add `whitespace-nowrap`.
5. `RequestCard` composer should keep text if the action fails; consider a message thread component (web has a local one in `request-detail.tsx`) and form fields (web has `components/form.tsx`).
6. Local components built: top nav/user menu, tabs, form fields, markdown renderer, status editor, mascot studio, confirm dialog.

**Backend**
1. `/me` has no workspace slug; web uses `NEXT_PUBLIC_DEFAULT_WORKSPACE`. Please return it (or a `workspaces` list).
2. No unauthenticated member list for dev login; web uses seed member ids (same UUIDs as the seed).
3. No `GET request by id`; detail uses `listRequests`.
4. `inbox` excludes the asker's own unsent drafts (e.g. agent-drafted asks); web adds them from `board.openRequests` for "Cần bạn xử lý". Confirm intended.
5. Secret error message should contain the rule in parentheses, e.g. `(openai-key)`; web parses `\(([\w. -]+)\)`.
6. SSE `change.kind` values: web handles `status|member|task|event|request|inbox|decision|agent`, anything else refreshes all.
7. Real hook command for the SessionStart snippet.

**Leader**: none blocking. Optional: expose `TaskState`/`MemberRole` types (already requested by Design).

## Round 3 (security, UI side)
- SEC-09: `safeExternalHref()` (`packages/ui/src/safe-url.ts`, tested) is the only gate for data-driven hrefs: `TaskChip` and handoff markdown links (`[text](url)`, http/https only, else plain text). The markdown renderer never renders raw HTML.
- SEC-05: `next.config.ts` sets CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. `script-src` keeps `'unsafe-inline'` (Next inline bootstrap, no nonce yet); dev adds `'unsafe-eval'` and `ws:`. `connect-src` = self + origins of `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_MCP_URL` (covers SSE); read at build time.
- Dev login: `ApiClient.devMembers(workspace)` sends `?workspace=<NEXT_PUBLIC_DEFAULT_WORKSPACE>`; a 404 hides the picker (GitHub button only).
- Deferred (paused pending Branding DNA): direction-aware request labels ("Nháp agent của bạn · gửi Minh", "Minh hỏi bạn", "Bạn hỏi Minh"; today's "Nháp từ agent · Minh" is ambiguous in "Cần bạn xử lý" and RequestCard), the admin "Kết nối GitHub" page (`githubWebhookSetup`, admin only, mascot 403), and the round-1 screenshot retakes.
