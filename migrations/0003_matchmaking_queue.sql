CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  combo TEXT NOT NULL,
  technique_id TEXT NOT NULL,
  name TEXT NOT NULL,
  spell_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  risk_queue INTEGER NOT NULL DEFAULT 0,
  is_ai INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_status_created
ON matchmaking_queue(status, created_at);
