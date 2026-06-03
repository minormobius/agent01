-- mino-scores: generic multi-game leaderboard.
-- One row per submission; ranking is score DESC, created_at ASC.
CREATE TABLE IF NOT EXISTS game_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT    NOT NULL,           -- slug: ^[a-z][a-z0-9_-]{1,31}$
  did        TEXT    NOT NULL,           -- submitter DID (from shared auth worker)
  handle     TEXT,                       -- submitter handle at submit time
  score      REAL    NOT NULL,           -- higher is better
  meta       TEXT,                       -- freeform breakdown, <= 200 chars
  created_at INTEGER NOT NULL            -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_game_scores_rank    ON game_scores(game, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_game_scores_recent  ON game_scores(game, created_at);
CREATE INDEX IF NOT EXISTS idx_game_scores_did     ON game_scores(did, game, created_at);
