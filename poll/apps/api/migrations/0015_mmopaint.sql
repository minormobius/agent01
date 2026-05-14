-- MMO Paint shared canvases.
--
-- A canvas has an owner (DID), an optional whitelist, and an append-only
-- log of strokes. Each stroke carries a hash linking it to the previous
-- stroke (prev_hash -> this_hash), so the ordering is tamper-evident
-- without per-stroke signatures. record_uri / record_cid are reserved
-- for the eventual ATProto-blob-chain phase: when the server starts
-- publishing the log to a service PDS, those columns get filled in and
-- the audit chain becomes verifiable across PDSes.

CREATE TABLE IF NOT EXISTS mmo_canvases (
  id                  TEXT PRIMARY KEY,
  owner_did           TEXT NOT NULL,
  owner_handle        TEXT NOT NULL,
  name                TEXT NOT NULL,
  width               INTEGER NOT NULL DEFAULT 1024,
  height              INTEGER NOT NULL DEFAULT 1024,
  public_contribute   INTEGER NOT NULL DEFAULT 1,   -- 1 = anyone authed, 0 = whitelist only
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  head_seq            INTEGER NOT NULL DEFAULT 0,
  head_hash           TEXT,                          -- hex SHA-256 of latest stroke
  stroke_count        INTEGER NOT NULL DEFAULT 0,
  contributor_count   INTEGER NOT NULL DEFAULT 0,
  record_uri          TEXT,                          -- service PDS AT URI (phase 2)
  record_cid          TEXT
);

CREATE INDEX IF NOT EXISTS idx_mmo_canvases_owner ON mmo_canvases(owner_did);
CREATE INDEX IF NOT EXISTS idx_mmo_canvases_updated ON mmo_canvases(updated_at DESC);

-- Whitelist of DIDs allowed to paint on a given canvas. Empty means
-- public_contribute decides. Owner is always implicitly allowed.
CREATE TABLE IF NOT EXISTS mmo_contributors (
  canvas_id    TEXT NOT NULL,
  did          TEXT NOT NULL,
  handle       TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  added_by_did TEXT NOT NULL,
  PRIMARY KEY (canvas_id, did)
);

CREATE INDEX IF NOT EXISTS idx_mmo_contributors_did ON mmo_contributors(did);

-- Append-only stroke log. seq is the canvas-local monotone counter
-- (assigned by the canvas DO). this_hash = SHA-256 over the
-- canonical encoding of (prev_hash || seq || author_did || tool ||
-- color || size || points). Compute & verification is described in
-- routes/mmopaint.ts. record_uri / record_cid become non-null when
-- the stroke (or a block containing it) is published to the service
-- PDS in phase 2.
CREATE TABLE IF NOT EXISTS mmo_strokes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id      TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  author_did     TEXT NOT NULL,
  author_handle  TEXT NOT NULL,
  tool           TEXT NOT NULL,                    -- 'brush' | 'eraser' | 'fill'
  color          TEXT NOT NULL,                    -- '#rrggbb'
  size           INTEGER NOT NULL,
  points         TEXT NOT NULL,                    -- JSON flat array [x1,y1,x2,y2,...]
  prev_hash      TEXT,                             -- hex SHA-256 (NULL for the genesis stroke)
  this_hash      TEXT NOT NULL,                    -- hex SHA-256
  created_at     INTEGER NOT NULL,
  record_uri     TEXT,                             -- phase 2
  record_cid     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mmo_strokes_canvas_seq
  ON mmo_strokes(canvas_id, seq);
CREATE INDEX IF NOT EXISTS idx_mmo_strokes_canvas_created
  ON mmo_strokes(canvas_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mmo_strokes_author
  ON mmo_strokes(author_did, created_at DESC);

-- Seed: one global canvas everyone can paint on. Owner is a placeholder
-- "service" DID; the canvas is public_contribute = 1 so no whitelist
-- check applies. Later we'll let users create their own canvases.
INSERT OR IGNORE INTO mmo_canvases
  (id, owner_did, owner_handle, name, width, height, public_contribute, created_at, updated_at)
VALUES
  ('global', 'did:plc:service', 'minomobi.com', 'Global Canvas',
   1024, 1024, 1, 0, 0);
