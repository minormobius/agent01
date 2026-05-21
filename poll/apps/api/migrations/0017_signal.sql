-- signal: vector index over the POSTS a Bluesky user has reposted.
--
-- Unlike ask (which indexes a writer's own threads), signal indexes the
-- *targets* of their reposts — what they signal-boost. The contrast against
-- ask is the interesting analytical move: ask = what you say, signal = what
-- you endorse, the gap is character.
--
-- Schema keyed by (subscriber_did, target_uri) so the same target post can
-- belong to many subscribers' signal indexes simultaneously — leaves the
-- door open for cross-user signal analytics later (which writers in a list
-- repost the same things, etc.).
--
-- Apply via .github/workflows/deploy-rite.yml.

CREATE TABLE IF NOT EXISTS signal_targets (
  subscriber_did  TEXT    NOT NULL,
  target_uri      TEXT    NOT NULL,
  target_did      TEXT    NOT NULL,
  target_rkey     TEXT    NOT NULL,
  text            TEXT    NOT NULL,
  author_handle   TEXT,
  author_display  TEXT,
  reposted_at     TEXT,                     -- ISO timestamp of the repost record
  created_at      TEXT,                     -- ISO timestamp of the target post
  embedding       BLOB    NOT NULL,         -- 768 float32 LE = 3072 bytes
  indexed_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (subscriber_did, target_uri)
);

CREATE INDEX IF NOT EXISTS idx_signal_targets_sub ON signal_targets(subscriber_did, reposted_at DESC);

CREATE TABLE IF NOT EXISTS signal_index_meta (
  subscriber_did TEXT    PRIMARY KEY,
  handle         TEXT,
  target_count   INTEGER NOT NULL DEFAULT 0,
  indexed_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  map_json       TEXT
);
