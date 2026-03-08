-- Add eligibility mode to polls and DID whitelist table

ALTER TABLE polls ADD COLUMN eligibility_mode TEXT NOT NULL DEFAULT 'open';
ALTER TABLE polls ADD COLUMN eligibility_source TEXT;

CREATE TABLE IF NOT EXISTS poll_eligible_dids (
  poll_id TEXT NOT NULL,
  did TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (poll_id, did),
  FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE INDEX IF NOT EXISTS idx_eligible_dids_poll ON poll_eligible_dids(poll_id);
