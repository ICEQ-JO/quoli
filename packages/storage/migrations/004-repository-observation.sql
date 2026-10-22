BEGIN;
CREATE TABLE IF NOT EXISTS repository_observation(
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  checked_at TEXT,
  captured_at TEXT
);
INSERT OR IGNORE INTO migrations VALUES(4);
COMMIT;
