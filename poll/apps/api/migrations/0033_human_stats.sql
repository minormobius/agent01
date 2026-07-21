-- human.mino.mobi — HUMAN MACHINERY, the bias arcade. Anonymous aggregate
-- stats for the exhibits ("you chose X — so did 73% of visitors"). One row
-- per (exhibit, bucket); n is a plain counter bumped by fire-and-forget
-- events. No ids, no fingerprints, no PII: the dataset is aggregate-only by
-- construction, and pre-binned client-side so raw reaction times / estimates
-- never leave the browser unbucketed.
CREATE TABLE IF NOT EXISTS human_stats (
  exhibit TEXT NOT NULL,             -- e.g. 'stroop', 'anchoring'
  bucket TEXT NOT NULL,              -- e.g. 'done', 'frame:gain|choice:sure'
  n INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (exhibit, bucket)
);
CREATE INDEX IF NOT EXISTS idx_human_stats_exhibit ON human_stats(exhibit);
