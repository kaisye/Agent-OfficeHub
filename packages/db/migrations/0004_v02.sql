-- Contract v0.2: audit entries carry a public uuid + channel; decisions need a rationale; reminder job lookup.
ALTER TABLE audit_log ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE audit_log ADD COLUMN via text NOT NULL DEFAULT 'web' CHECK (via IN ('web','api','mcp','webhook','system'));
ALTER TABLE decisions ADD CONSTRAINT decisions_rationale_nonempty CHECK (char_length(rationale) >= 1) NOT VALID;

-- The reminder job runs without a workspace context: narrow definer function listing open, overdue requests.
CREATE FUNCTION auth_due_requests() RETURNS TABLE (id uuid, workspace_id uuid, due_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$f$ SELECT id, workspace_id, due_at FROM requests WHERE due_at IS NOT NULL AND due_at <= now() AND status IN ('sent','reply_drafted','replied') $f$;
REVOKE ALL ON FUNCTION auth_due_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_due_requests() TO officehub_app;
