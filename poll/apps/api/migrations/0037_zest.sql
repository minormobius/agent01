-- 0037_zest.sql — zest.mino.mobi (the embedding-geometry feed game)
--
-- Two tables on the shared atpolls-db:
--
--   zest_embeddings  a content-addressed cache of BGE vectors. The game shows
--                    the same posts to everyone, so without this every player
--                    re-spends Workers AI neurons on text that was already
--                    embedded this morning. Keyed by a hash of the exact text,
--                    not by post URI, so an edited post is a cache miss and a
--                    quoted duplicate is a hit.
--
--   zest_basis       the corpus basis: per-dimension mean/scale, the variance
--                    ranking, the top principal components. One row per
--                    (model, version). This is the thing that makes two
--                    players' shapes COMPARABLE — a shape only means anything
--                    relative to the corpus it is a deviation from, so the
--                    basis is versioned and pinned rather than recomputed per
--                    session.

CREATE TABLE IF NOT EXISTS zest_embeddings (
  hash       TEXT PRIMARY KEY,   -- FNV-1a 64 of model + '\n' + text, as hex
  model      TEXT NOT NULL,
  dim        INTEGER NOT NULL,
  embedding  BLOB NOT NULL,      -- little-endian Float32Array
  created_at INTEGER NOT NULL    -- unix seconds, for pruning
);

CREATE INDEX IF NOT EXISTS zest_embeddings_created
  ON zest_embeddings (created_at);

CREATE TABLE IF NOT EXISTS zest_basis (
  id         TEXT PRIMARY KEY,   -- '<model>/<version>'
  model      TEXT NOT NULL,
  version    TEXT NOT NULL,
  dim        INTEGER NOT NULL,
  n          INTEGER NOT NULL,   -- posts the basis was fitted on
  payload    TEXT NOT NULL,      -- JSON: mean, std, scale, order, pc, normQ
  built_at   INTEGER NOT NULL
);
