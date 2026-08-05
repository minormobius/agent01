-- 0035_words.sql — asynchronous word games for words.mino.mobi.
--
-- Applied to the SHARED atpolls-db by .github/workflows/deploy-words.yml before
-- the worker ships. Idempotent (IF NOT EXISTS throughout), so re-running it on
-- an already-migrated database is a no-op and the deploy step does not need to
-- know whether it has run before.
--
-- The whole game — board, racks, bag, history — is one JSON blob in
-- words_games.state. That is a deliberate choice over a normalised board:
--   * a turn is a single compare-and-set against `version`, so two players
--     moving at once cannot interleave into a corrupt position;
--   * the rules engine (words/engine/) already owns the state shape, and it is
--     the same shape the browser keeps in localStorage for offline play.
-- words_moves is the audit/replay log, not the source of truth — though the
-- engine can rebuild any game from the seed plus that log alone.

CREATE TABLE IF NOT EXISTS words_games (
  code        TEXT PRIMARY KEY,          -- five-character invite code
  layout      TEXT NOT NULL,             -- fair | hazard | archipelago
  seed        TEXT NOT NULL,             -- fixes the bag; NEVER sent to a client
  status      TEXT NOT NULL,             -- active | done
  turn        INTEGER NOT NULL,          -- seat to move
  seat_count  INTEGER NOT NULL,
  state       TEXT NOT NULL,             -- the engine state, JSON
  version     INTEGER NOT NULL DEFAULT 1,-- compare-and-set guard
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS words_games_updated ON words_games (updated_at DESC);
CREATE INDEX IF NOT EXISTS words_games_status ON words_games (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS words_seats (
  code        TEXT NOT NULL,
  seat        INTEGER NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- human | bot
  token_hash  TEXT,                      -- SHA-256 of the player token; NULL = seat open
  joined_at   INTEGER,
  PRIMARY KEY (code, seat)
);

-- The hot lookup: "which seat does this token own", on every single move.
CREATE INDEX IF NOT EXISTS words_seats_token ON words_seats (code, token_hash);

CREATE TABLE IF NOT EXISTS words_moves (
  code        TEXT NOT NULL,
  ply         INTEGER NOT NULL,
  seat        INTEGER NOT NULL,
  kind        TEXT NOT NULL,             -- play | pass | exchange | resign
  word        TEXT,
  score       INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,             -- the full log entry, JSON
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (code, ply)                -- makes the INSERT OR IGNORE a real dedupe
);

CREATE INDEX IF NOT EXISTS words_moves_game ON words_moves (code, ply);
