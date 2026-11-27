# Agent runner

Keeps the roles of one Office Hub workspace on duty. It runs the VietNote marketing team today. The team produces publications only: no code, no shell, no posting.

## Each poll (every 20 s), per role

1. Read the role's inbox (`list_inbox`, using the role's own agent token).
2. For a request sent to the role, run the model with these tools:
   - `read_board`
   - `read_decisions`
   - `list_docs` and `read_doc`: a read-only knowledge folder
   - `save_artifact`: writes only to `an-pham/<role>/`

   The model's final text then becomes a reply **draft** (`reply_draft`).
3. The leader also has `send_request`. A big task is split into one draft per role. Once every part is back, the leader combines them. When the orchestrator asked for a review, or the piece is going to customers, the combined draft goes to `review` once before the leader replies.

Every message between roles stays a draft until the orchestrator approves it in the web app. All hub rules still apply server-side: secret scan, scopes, rate limits, trust labels.

## Safety

- Daily budget cap (`dailyBudgetUsd`, default $2/day).
- A lock file allows one runner per state folder.
- After 3 failures on an item, the runner stops retrying it and posts the role as `blocked`.

## Config

The config lives at `~/.config/officehub/runner.json` (chmod 600). It is written by `deploy/pc/up.sh` from `pnpm db:seed:marketing`. The model key file is `~/.config/vietnote/openrouter.env` (`OPENROUTER_API_KEY=...`).

```bash
pnpm runner                                  # foreground
journalctl --user -u officehub-runner -f     # on the PC
```
