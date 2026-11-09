-- Realtime: every write to a board-relevant table emits NOTIFY officehub_changes {workspaceId, kind, id}.
CREATE FUNCTION notify_change() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  PERFORM pg_notify('officehub_changes', json_build_object(
    'workspaceId', NEW.workspace_id, 'kind', TG_ARGV[0], 'id', j ->> TG_ARGV[1])::text);
  RETURN NEW;
END $f$;
CREATE TRIGGER n_status AFTER INSERT OR UPDATE ON status_cards FOR EACH ROW EXECUTE FUNCTION notify_change('card', 'member_id');
CREATE TRIGGER n_tasks AFTER INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION notify_change('task', 'id');
CREATE TRIGGER n_events AFTER INSERT ON events FOR EACH ROW EXECUTE FUNCTION notify_change('event', 'id');
CREATE TRIGGER n_requests AFTER INSERT OR UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION notify_change('request', 'id');
CREATE TRIGGER n_decisions AFTER INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION notify_change('decision', 'id');
CREATE TRIGGER n_members AFTER INSERT OR UPDATE ON members FOR EACH ROW EXECUTE FUNCTION notify_change('member', 'id');
CREATE TRIGGER n_agents AFTER INSERT OR UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION notify_change('agent', 'id');
