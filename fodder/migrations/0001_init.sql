-- Fodder: crowdsourced verbose-sentence corpus for rite
--
-- Lives in the shared atpolls-db D1 database alongside poll/feed tables.
-- Apply via: npx wrangler d1 execute atpolls-db --file=fodder/migrations/0001_init.sql --remote

CREATE TABLE IF NOT EXISTS fodder_candidates (
  id              TEXT    PRIMARY KEY,
  original        TEXT    NOT NULL,
  style           TEXT    NOT NULL,
  source          TEXT,                       -- "Henry James — The Portrait of a Lady (Gutenberg #2833)"
  refs_json       TEXT    NOT NULL,           -- JSON array of {literal, idiomatic, alternative} rewrites
  word_count      INTEGER NOT NULL,
  flesch          REAL,
  yes_votes       INTEGER NOT NULL DEFAULT 0,
  no_votes        INTEGER NOT NULL DEFAULT 0,
  skip_votes      INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  promoted_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_fodder_candidates_status      ON fodder_candidates(status);
CREATE INDEX IF NOT EXISTS idx_fodder_candidates_pending_age ON fodder_candidates(status, created_at);

CREATE TABLE IF NOT EXISTS fodder_votes (
  candidate_id TEXT NOT NULL,
  voter_id     TEXT NOT NULL,
  direction    TEXT NOT NULL,                 -- yes | no | skip
  voted_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (candidate_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_fodder_votes_voter ON fodder_votes(voter_id);

-- Tiny KV table for cron bookkeeping (last book mined, mining cursor, etc.)
CREATE TABLE IF NOT EXISTS fodder_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
