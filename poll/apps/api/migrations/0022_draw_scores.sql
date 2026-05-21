-- Polygon drawing game leaderboard scores.
-- Each row is a single submitted result, verified by the OAuth-authenticated DID at submit time.
-- See: mino.mobi/draw and routes/draw.ts in this worker.

CREATE TABLE IF NOT EXISTS draw_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  handle TEXT NOT NULL,
  shape TEXT NOT NULL,
  n_sides INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draw_scores_shape_score
  ON draw_scores(shape, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draw_scores_score
  ON draw_scores(score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draw_scores_did_created
  ON draw_scores(did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draw_scores_created
  ON draw_scores(created_at DESC);
