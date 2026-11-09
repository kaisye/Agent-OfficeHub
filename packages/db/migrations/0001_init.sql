-- Office Hub core schema. Owner role (migrator) owns everything; the app connects as officehub_app (see 0002).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  connectors text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  github_login text,
  role text NOT NULL CHECK (role IN ('admin','member')),
  areas text[] NOT NULL DEFAULT '{}',
  mascot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, github_login)
);
CREATE INDEX members_github_idx ON members (lower(github_login));

CREATE TABLE status_cards (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  presence text NOT NULL CHECK (presence IN ('working','waiting','blocked','reviewing','idle','offline')),
  doing text CHECK (char_length(doing) <= 280),
  branch text CHECK (char_length(branch) <= 200),
  waiting_on uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK (updated_by IN ('human','agent'))
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('claude-code','codex','gemini-cli','other')),
  label text NOT NULL CHECK (char_length(label) <= 60),
  scopes text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL UNIQUE, -- sha256 hex of the full token; the token itself is never stored
  token_prefix text NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('github_pr','github_issue','jira','manual')),
  external_url text,
  external_key text,
  title text NOT NULL CHECK (char_length(title) <= 300),
  assignee_id uuid REFERENCES members(id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('open','in_progress','in_review','blocked','done','closed')),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tasks_external_uq ON tasks (workspace_id, source, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,
  type text NOT NULL,
  time timestamptz NOT NULL DEFAULT now(),
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  actor_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}',
  dedupe_key text
);
CREATE UNIQUE INDEX events_dedupe_uq ON events (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX events_ws_time_idx ON events (workspace_id, time DESC);

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asker_id uuid NOT NULL REFERENCES members(id),
  receiver_id uuid NOT NULL REFERENCES members(id),
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('draft','sent','reply_drafted','replied','closed','cancelled')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (asker_id <> receiver_id)
);
CREATE INDEX requests_ws_idx ON requests (workspace_id, updated_at DESC);

CREATE TABLE request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ask','reply','follow_up')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  authored_by text NOT NULL CHECK (authored_by IN ('human','agent')),
  author_member_id uuid NOT NULL REFERENCES members(id),
  author_agent_id uuid REFERENCES agents(id),
  sent_by_id uuid REFERENCES members(id), -- NULL while still a draft
  edited_before_send boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_messages_req_idx ON request_messages (request_id, created_at);

CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(body) <= 5000),
  rationale text NOT NULL CHECK (char_length(rationale) <= 5000),
  decided_by_id uuid NOT NULL REFERENCES members(id), -- a member row: an agent can never be the decider
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor_kind text NOT NULL CHECK (actor_kind IN ('human','agent','system','webhook')),
  member_id uuid,
  agent_id uuid,
  action text NOT NULL,
  target_kind text,
  target_id text,
  outcome text NOT NULL DEFAULT 'ok',
  meta jsonb NOT NULL DEFAULT '{}' -- never contains user-supplied free text from rejected/secret content
);
CREATE INDEX audit_ws_at_idx ON audit_log (workspace_id, at DESC);

CREATE TABLE sessions (
  id_hash text PRIMARY KEY, -- sha256 of the cookie value
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE inbox_reads (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seen_updated_at timestamptz NOT NULL,
  PRIMARY KEY (member_id, request_id)
);
