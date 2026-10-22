BEGIN;
CREATE TABLE IF NOT EXISTS repositories(
  project_id TEXT PRIMARY KEY REFERENCES projects(id), root TEXT NOT NULL,
  include_untracked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS snapshots(
  id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) DEFERRABLE INITIALLY DEFERRED, body TEXT NOT NULL, PRIMARY KEY(project_id,id));
CREATE INDEX IF NOT EXISTS session_snapshots ON snapshots(project_id,session_id);
CREATE TRIGGER IF NOT EXISTS immutable_snapshots_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'append-only snapshots'); END;
CREATE TRIGGER IF NOT EXISTS immutable_snapshots_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'append-only snapshots'); END;
INSERT OR IGNORE INTO migrations VALUES(2);
COMMIT;
