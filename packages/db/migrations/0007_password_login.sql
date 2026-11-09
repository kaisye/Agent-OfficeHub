-- v0.5: password login via one-time invite links (no GitHub / email service needed). Additive.

ALTER TABLE members ADD COLUMN email text, ADD COLUMN password_hash text;
-- One account per email across the whole hub (login does not know the workspace yet).
CREATE UNIQUE INDEX members_email_uq ON members (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,      -- sha256 of the link token; the token itself is never stored
  created_by uuid NOT NULL REFERENCES members(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_member_idx ON invites (member_id) WHERE used_at IS NULL;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation ON invites USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO officehub_app;

-- Pre-auth lookups (workspace unknown yet): narrow SECURITY DEFINER functions returning only what is needed.
CREATE FUNCTION auth_invite_by_hash(p_hash text)
  RETURNS TABLE (id uuid, workspace_id uuid, member_id uuid, display_name text, mascot jsonb, email text, workspace_name text, workspace_slug text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$f$ SELECT i.id, i.workspace_id, i.member_id, m.display_name, m.mascot, m.email, w.name, w.slug
    FROM invites i JOIN members m ON m.id = i.member_id JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.token_hash = p_hash AND i.used_at IS NULL AND i.expires_at > now() $f$;

CREATE FUNCTION auth_login_by_email(p_email text)
  RETURNS TABLE (id uuid, workspace_id uuid, role text, password_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$f$ SELECT id, workspace_id, role::text, password_hash FROM members WHERE lower(email) = lower(p_email) LIMIT 1 $f$;

REVOKE ALL ON FUNCTION auth_invite_by_hash(text), auth_login_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_invite_by_hash(text), auth_login_by_email(text) TO officehub_app;
