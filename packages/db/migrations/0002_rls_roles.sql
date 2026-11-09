-- Rule 6: row-level security per workspace + a NON-superuser app role so RLS really applies.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'officehub_app') THEN
    CREATE ROLE officehub_app LOGIN PASSWORD 'officehub_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $do$;

CREATE FUNCTION app_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS
$f$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $f$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['members','status_cards','agents','tasks','events','requests','request_messages',
                           'decisions','audit_log','sessions','inbox_reads']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY ws_isolation ON %I USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id())', t);
  END LOOP;
END $do$;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation ON workspaces USING (id = app_workspace_id()) WITH CHECK (id = app_workspace_id());

-- Rule 7: append-only. Grants AND triggers (the trigger also stops the owner role).
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$f$ BEGIN RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501'; END $f$;
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

GRANT USAGE ON SCHEMA public TO officehub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON members, status_cards, agents, tasks, requests, request_messages,
  decisions, sessions, inbox_reads TO officehub_app;
GRANT SELECT, INSERT ON workspaces, events, audit_log TO officehub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO officehub_app;

-- Pre-auth lookups (the workspace is not known yet): narrow SECURITY DEFINER functions, no general bypass.
CREATE FUNCTION auth_workspace_by_slug(p_slug text) RETURNS SETOF workspaces
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT * FROM workspaces WHERE slug = p_slug $f$;
CREATE FUNCTION auth_agent_by_hash(p_hash text) RETURNS SETOF agents
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT * FROM agents WHERE token_hash = p_hash $f$;
CREATE FUNCTION auth_session_by_hash(p_hash text) RETURNS SETOF sessions
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT * FROM sessions WHERE id_hash = p_hash AND expires_at > now() $f$;
CREATE FUNCTION auth_member_by_id(p_id uuid) RETURNS SETOF members
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT * FROM members WHERE id = p_id $f$;
CREATE FUNCTION auth_members_by_github(p_login text) RETURNS SETOF members
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT * FROM members WHERE lower(github_login) = lower(p_login) ORDER BY created_at $f$;
REVOKE ALL ON FUNCTION auth_workspace_by_slug(text), auth_agent_by_hash(text), auth_session_by_hash(text),
  auth_member_by_id(uuid), auth_members_by_github(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_workspace_by_slug(text), auth_agent_by_hash(text), auth_session_by_hash(text),
  auth_member_by_id(uuid), auth_members_by_github(text) TO officehub_app;
