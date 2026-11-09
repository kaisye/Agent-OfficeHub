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

## Known gaps
- Mock data is per tab and not shared across tabs; no simulated "other users" activity, so realtime is only visible for own actions.
- In the requests list, `RequestCard`'s inline composer clears typed text on submit; if the server rejects it (e.g. secret) the text is lost. Detail page keeps the text.
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
