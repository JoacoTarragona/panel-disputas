PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS status_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  agregador TEXT NOT NULL CHECK (agregador IN ('uber', 'pedidosya', 'rappi')),
  error TEXT
);

CREATE TABLE IF NOT EXISTS status_samples (
  check_id INTEGER NOT NULL REFERENCES status_checks(id) ON DELETE CASCADE,
  agregador TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('open', 'paused', 'closed', 'offhours')),
  raw_state TEXT,
  reason TEXT,
  author TEXT,
  PRIMARY KEY (check_id, agregador, store_id)
);

CREATE INDEX IF NOT EXISTS status_samples_store_day_idx
  ON status_samples (agregador, store_id, check_id);
