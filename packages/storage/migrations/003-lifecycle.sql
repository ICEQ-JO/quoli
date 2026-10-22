BEGIN;
-- Lifecycle state is the explicit exception to the append-only history.
CREATE TABLE IF NOT EXISTS project_lifecycle(
  project_id TEXT PRIMARY KEY,
  paused INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER,
  purged_at TEXT,
  epoch INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO project_lifecycle(project_id, paused, retention_days, purged_at, epoch)
  SELECT id, 0, NULL, NULL, 1 FROM projects;
INSERT OR IGNORE INTO migrations VALUES(3);
COMMIT;
