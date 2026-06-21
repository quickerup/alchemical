CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  created_at INTEGER,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  points INTEGER DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS signature_jutsu (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  name TEXT,
  combo TEXT,
  atk INTEGER,
  def INTEGER,
  spc INTEGER,
  class TEXT,
  usage_count INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  player_a TEXT,
  player_b TEXT,
  combo_a TEXT,
  combo_b TEXT,
  winner TEXT,
  log TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS ai_butlers (
  id TEXT PRIMARY KEY,
  name TEXT,
  style TEXT,
  win_rate REAL DEFAULT 0.5,
  adaptation REAL DEFAULT 0.0,
  last_combo TEXT,
  created_at INTEGER
);
