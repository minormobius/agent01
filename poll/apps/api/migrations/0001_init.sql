-- Anonymous Polls D1 Schema

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  host_did TEXT NOT NULL,
  asker_did TEXT,
  question TEXT NOT NULL,
  options TEXT NOT NULL, -- JSON array
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  mode TEXT NOT NULL DEFAULT 'trusted_host_v1',
  public_verification_key TEXT NOT NULL,
  atproto_record_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_polls_host_did ON polls(host_did);

CREATE TABLE IF NOT EXISTS eligibility (
  poll_id TEXT NOT NULL,
  responder_did TEXT NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'eligible',
  consumed_at TEXT,
  issuance_mode TEXT NOT NULL,
  receipt_hash TEXT,
  PRIMARY KEY (poll_id, responder_did),
  FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE INDEX idx_eligibility_poll ON eligibility(poll_id);
CREATE INDEX idx_eligibility_did ON eligibility(responder_did);

CREATE TABLE IF NOT EXISTS ballots (
  ballot_id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  public_ballot_serial INTEGER NOT NULL,
  nullifier TEXT NOT NULL UNIQUE,
  choice INTEGER NOT NULL,
  token_message TEXT NOT NULL,
  issuer_signature TEXT NOT NULL,
  credential_proof TEXT,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_record_uri TEXT,
  rolling_audit_hash TEXT NOT NULL,
  FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE INDEX idx_ballots_poll ON ballots(poll_id);
CREATE INDEX idx_ballots_nullifier ON ballots(nullifier);
CREATE INDEX idx_ballots_submitted ON ballots(submitted_at);

CREATE TABLE IF NOT EXISTS tally_snapshots (
  poll_id TEXT NOT NULL,
  counts_by_option TEXT NOT NULL, -- JSON object
  ballot_count INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  final INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll_id, computed_at),
  FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload TEXT NOT NULL,
  rolling_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE INDEX idx_audit_poll ON audit_events(poll_id);
CREATE INDEX idx_audit_created ON audit_events(created_at);

-- Sessions table for ATProto OAuth
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  handle TEXT,
  access_token TEXT,
  refresh_token TEXT,
  pds_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_did ON sessions(did);
