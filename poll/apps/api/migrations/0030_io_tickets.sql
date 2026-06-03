-- io.mino.mobi — ATProto ticket tracker (bug / feature / idea sweeper).
--
-- Applied to the shared atpolls-db by deploy-io.yml's migration loop (idempotent;
-- a non-zero "already applied" return is treated as success and the deploy continues).
--
-- Source of truth for each ticket is its author's own PDS record
-- (com.minomobi.io.ticket). This table is a rebuildable read-cache that the
-- board renders from, PLUS board-owned triage state (status/severity) that we
-- deliberately never write back into anyone else's repo.

CREATE TABLE IF NOT EXISTS io_tickets (
  uri          TEXT PRIMARY KEY,        -- at://did/com.minomobi.io.ticket/rkey
  cid          TEXT,
  author_did   TEXT NOT NULL,
  author_handle TEXT,
  kind         TEXT NOT NULL,           -- bug | feature | idea
  title        TEXT NOT NULL,
  body         TEXT,
  site         TEXT,                    -- e.g. "poll.mino.mobi"
  url          TEXT,                    -- exact page if known
  repo         TEXT,                    -- e.g. "minormobius/agent01" (nightly-dispatch scoping)
  severity     TEXT,                    -- low | med | high (bugs; advisory)
  tags         TEXT,                    -- JSON array
  source_kind  TEXT NOT NULL DEFAULT 'manual',  -- manual | swept
  source_post  TEXT,                    -- swept: at-uri of the originating Bluesky post
  -- board-owned, never written back to any PDS:
  status       TEXT NOT NULL DEFAULT 'new',     -- new | triaged | in_progress | done | wontfix
  created_at   TEXT NOT NULL,           -- ISO datetime from the record
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_io_tickets_status ON io_tickets(status);
CREATE INDEX IF NOT EXISTS idx_io_tickets_repo   ON io_tickets(repo);
CREATE INDEX IF NOT EXISTS idx_io_tickets_kind   ON io_tickets(kind);
CREATE INDEX IF NOT EXISTS idx_io_tickets_author ON io_tickets(author_did);

-- Sweeper bookkeeping (phase 4): which Bluesky posts we've already turned into
-- tickets (dedup by PK), so re-runs are no-ops.
CREATE TABLE IF NOT EXISTS io_sweep_seen (
  post_uri   TEXT PRIMARY KEY,
  ticket_uri TEXT,
  swept_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sweeper / indexer scan state (e.g. searchPosts cursor, last Constellation pass).
CREATE TABLE IF NOT EXISTS io_sweep_state (
  k TEXT PRIMARY KEY,
  v TEXT
);
