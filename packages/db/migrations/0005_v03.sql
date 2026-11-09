-- Contract v0.3 (additive).
-- 1) Shared rate-limit buckets (API + MCP take from the same rows; atomic upsert, DB clock).
CREATE TABLE rate_buckets (
  key text PRIMARY KEY,                -- "<agentId>:<any|status|draft>"
  tokens double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_ok boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_buckets TO officehub_app;

-- 2) Dev login picker: pre-auth member list (workspace unknown yet). The API only exposes it when DEV_LOGIN_ENABLED=true.
CREATE FUNCTION auth_dev_members() RETURNS TABLE (id uuid, display_name text, workspace_slug text, mascot jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$f$ SELECT m.id, m.display_name, w.slug, m.mascot FROM members m JOIN workspaces w ON w.id = m.workspace_id ORDER BY w.created_at, m.created_at, m.display_name $f$;
REVOKE ALL ON FUNCTION auth_dev_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_dev_members() TO officehub_app;

-- 3) Open-draft cap lookups per agent.
CREATE INDEX request_messages_agent_ask_idx ON request_messages (author_agent_id) WHERE kind = 'ask' AND author_agent_id IS NOT NULL;
