-- ask: vector index over a Bluesky user's prose threads
--
-- Embeddings come from @cf/baai/bge-base-en-v1.5 (768-dim float32).
-- One row per thread; refreshing a profile is INSERT OR IGNORE on (did, thread_id),
-- so re-indexing is cheap and idempotent.
--
-- Apply via .github/workflows/deploy-rite.yml (which runs all rite migrations
-- on push to rite/**).

CREATE TABLE IF NOT EXISTS ask_threads (
  did          TEXT    NOT NULL,
  thread_id    TEXT    NOT NULL,         -- root rkey of the thread (stable across re-indexings)
  text         TEXT    NOT NULL,         -- composed thread body (newline-joined posts)
  post_count   INTEGER NOT NULL,
  char_count   INTEGER NOT NULL,
  flesch       REAL,
  created_at   TEXT,                     -- ISO timestamp of root post
  embedding    BLOB    NOT NULL,         -- 768 float32 LE = 3072 bytes
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (did, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_threads_did ON ask_threads(did, char_count DESC);

CREATE TABLE IF NOT EXISTS ask_index_meta (
  did            TEXT    PRIMARY KEY,
  handle         TEXT,
  thread_count   INTEGER NOT NULL DEFAULT 0,
  post_count     INTEGER,
  total_chars    INTEGER,
  indexed_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
