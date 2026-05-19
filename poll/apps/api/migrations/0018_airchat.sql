-- airchat: voice-first social on ATProto
--
-- Two tables:
--   airchat_whitelist — DIDs allowed to write voice records via our service.
--     Public reads (PDS records are inherently public); whitelist gates the
--     UX + transcription. Anyone could fork the schema and write to their
--     own PDS independently — that's the ATProto promise; the whitelist
--     gates *our* service, not the data.
--   airchat_sessions — server-side session storage for app-password auth.
--     Stores PDS access + refresh JWTs, never exposed to the browser
--     (BFF pattern; browser holds an opaque session_id cookie).
--   airchat_voices — read cache for the feed. PDS is canonical; this is
--     just a denormalized mirror so feed reads don't fan out across N PDSes.
--
-- Apply via .github/workflows/deploy-airchat.yml.

CREATE TABLE IF NOT EXISTS airchat_whitelist (
  did         TEXT    PRIMARY KEY,
  handle      TEXT,
  added_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  added_by    TEXT,                                    -- admin DID who added them
  note        TEXT
);

CREATE TABLE IF NOT EXISTS airchat_sessions (
  session_id    TEXT    PRIMARY KEY,                    -- random 32-byte hex
  did           TEXT    NOT NULL,
  handle        TEXT    NOT NULL,
  pds_url       TEXT    NOT NULL,
  access_jwt    TEXT    NOT NULL,
  refresh_jwt   TEXT    NOT NULL,
  access_expires_at  INTEGER,                           -- unix seconds; we refresh ~5 min before
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_airchat_sessions_did ON airchat_sessions(did);

CREATE TABLE IF NOT EXISTS airchat_voices (
  -- PDS-side identifiers (canonical):
  uri           TEXT    PRIMARY KEY,                    -- at://did/com.minomobi.airchat.voice/rkey
  did           TEXT    NOT NULL,
  rkey          TEXT    NOT NULL,
  cid           TEXT,
  pds_url       TEXT,                                   -- for building public sync.getBlob URLs
  -- Audio:
  audio_cid     TEXT    NOT NULL,                       -- blob ref
  audio_mime    TEXT    NOT NULL,
  audio_size    INTEGER,
  duration_sec  REAL,
  -- Transcript (may be edited by author before posting):
  text          TEXT    NOT NULL,
  -- Threading:
  reply_root_uri    TEXT,
  reply_parent_uri  TEXT,
  -- Timestamps:
  created_at    TEXT    NOT NULL,                       -- ISO from record
  indexed_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_airchat_voices_did_time ON airchat_voices(did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_airchat_voices_time ON airchat_voices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_airchat_voices_thread ON airchat_voices(reply_root_uri);
