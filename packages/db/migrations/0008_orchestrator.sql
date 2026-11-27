-- v0.6 (2026-11-27): ONE human orchestrator + role seats held by agents. See docs/redesign-orchestrator.md.
--
-- DATA RESET (approved by the orchestrator on 2026-11-27): every workspace is deleted. The previous data was the
-- Tripflix demo seed and its shape (member-to-member requests) has no meaning in v0.6. Run `pnpm db:seed` after.
-- events / audit_log are append-only by trigger; the triggers are paused for this one wipe only.
ALTER TABLE events DISABLE TRIGGER events_append_only;
ALTER TABLE audit_log DISABLE TRIGGER audit_append_only;
DELETE FROM workspaces;
ALTER TABLE events ENABLE TRIGGER events_append_only;
ALTER TABLE audit_log ENABLE TRIGGER audit_append_only;
DELETE FROM rate_buckets;

-- Roles: the seats on the board.
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{1,30}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  mission text NOT NULL DEFAULT '' CHECK (char_length(mission) <= 500),
  owned_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(owned_paths) <= 50),
  handoff_path text CHECK (char_length(handoff_path) <= 200),
  wave int NOT NULL DEFAULT 0 CHECK (wave BETWEEN 0 AND 9),
  mascot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key),
  UNIQUE (workspace_id, id)
);

-- Agents hold a role (owner_id stays: the orchestrator who issued the token).
ALTER TABLE agents ADD COLUMN role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE;
CREATE INDEX agents_role_idx ON agents (role_id);

-- Status cards are per role now.
DROP TABLE status_cards;
CREATE TABLE status_cards (
  role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  presence text NOT NULL CHECK (presence IN ('working','waiting','blocked','reviewing','idle','offline')),
  doing text CHECK (char_length(doing) <= 280),
  branch text CHECK (char_length(branch) <= 200),
  paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(paths) <= 50),
  waiting_on uuid[] NOT NULL DEFAULT '{}', -- role ids
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK (updated_by IN ('human','agent')),
  updated_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL
);

-- Tasks belong to a role.
ALTER TABLE tasks DROP COLUMN assignee_id;
ALTER TABLE tasks ADD COLUMN role_id uuid REFERENCES roles(id) ON DELETE SET NULL;

-- Requests: parties are roles; NULL = the orchestrator.
ALTER TABLE requests DROP COLUMN asker_id CASCADE, DROP COLUMN receiver_id CASCADE;
ALTER TABLE requests
  ADD COLUMN asker_role_id uuid REFERENCES roles(id),
  ADD COLUMN receiver_role_id uuid REFERENCES roles(id),
  ADD COLUMN kind text NOT NULL DEFAULT 'question' CHECK (kind IN ('question','contract_change','review','handoff','blocker')),
  ADD COLUMN auto_forward_reply boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT requests_has_role CHECK (asker_role_id IS NOT NULL OR receiver_role_id IS NOT NULL),
  ADD CONSTRAINT requests_two_sides CHECK (asker_role_id IS DISTINCT FROM receiver_role_id),
  ADD CONSTRAINT requests_auto_forward_question CHECK (NOT auto_forward_reply OR kind = 'question');
CREATE INDEX requests_asker_role_idx ON requests (asker_role_id);
CREATE INDEX requests_receiver_role_idx ON requests (receiver_role_id);

-- Messages: written by the orchestrator (author_member_id) or by an agent for its role (author_role_id).
ALTER TABLE request_messages ALTER COLUMN author_member_id DROP NOT NULL;
ALTER TABLE request_messages ADD COLUMN author_role_id uuid REFERENCES roles(id);
ALTER TABLE request_messages ADD CONSTRAINT request_messages_author
  CHECK ((authored_by = 'human' AND author_member_id IS NOT NULL) OR (authored_by = 'agent' AND author_role_id IS NOT NULL AND author_agent_id IS NOT NULL));

-- Read markers for roles (the orchestrator keeps using inbox_reads).
CREATE TABLE role_reads (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seen_updated_at timestamptz NOT NULL,
  PRIMARY KEY (role_id, request_id)
);

-- Decisions concern roles; an agent may only PROPOSE one.
ALTER TABLE decisions ADD COLUMN role_ids uuid[] NOT NULL DEFAULT '{}';
CREATE TABLE decision_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(body) <= 5000),
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  decision_id uuid REFERENCES decisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX decision_proposals_pending_idx ON decision_proposals (workspace_id) WHERE status = 'pending';
ALTER TABLE decisions ADD COLUMN proposal_id uuid REFERENCES decision_proposals(id);

-- Rule 6 (RLS) + grants for the new / recreated tables.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','status_cards','role_reads','decision_proposals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY ws_isolation ON %I USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id())', t);
  END LOOP;
END $do$;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles, status_cards, role_reads, decision_proposals TO officehub_app;

-- Realtime.
CREATE TRIGGER n_status AFTER INSERT OR UPDATE ON status_cards FOR EACH ROW EXECUTE FUNCTION notify_change('card', 'role_id');
CREATE TRIGGER n_roles AFTER INSERT OR UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION notify_change('role', 'id');
CREATE TRIGGER n_proposals AFTER INSERT OR UPDATE ON decision_proposals FOR EACH ROW EXECUTE FUNCTION notify_change('proposal', 'id');
