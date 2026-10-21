BEGIN;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, synthetic INTEGER NOT NULL, policy TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT NOT NULL,
        source TEXT NOT NULL, producer_id TEXT NOT NULL, delivery_id TEXT NOT NULL,
        received_at TEXT NOT NULL, body TEXT NOT NULL,
        UNIQUE(project_id,source,producer_id,delivery_id));
      CREATE INDEX IF NOT EXISTS session_events ON events(project_id,session_id,sequence);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id),body TEXT NOT NULL,PRIMARY KEY(project_id,id));
      CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append-only events'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append-only events'); END;
      INSERT OR IGNORE INTO migrations VALUES(1);
      COMMIT;
