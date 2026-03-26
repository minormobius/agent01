-- Survey mode: multi-question polling instruments
-- A survey groups multiple questions under one credential (one blind-signed credential per voter per survey)

CREATE TABLE surveys (
  id TEXT PRIMARY KEY,
  host_did TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  eligibility_mode TEXT NOT NULL DEFAULT 'open',
  eligibility_source TEXT,
  host_key_fingerprint TEXT NOT NULL,
  host_public_key TEXT,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  atproto_record_uri TEXT,
  bluesky_post_uri TEXT,
  bluesky_post_cid TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE survey_questions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  position INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  UNIQUE(survey_id, position)
);
CREATE INDEX idx_sq_survey_id ON survey_questions(survey_id);

CREATE TABLE survey_ballots (
  ballot_id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  public_ballot_serial INTEGER NOT NULL,
  nullifier TEXT NOT NULL UNIQUE,
  choices TEXT NOT NULL,
  token_message TEXT NOT NULL,
  issuer_signature TEXT NOT NULL,
  credential_proof TEXT,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  submitted_at TEXT NOT NULL,
  published_record_uri TEXT,
  rolling_audit_hash TEXT NOT NULL
);
CREATE INDEX idx_sb_survey_id ON survey_ballots(survey_id);

CREATE TABLE survey_eligibility (
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  responder_did TEXT NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'eligible',
  consumed_at TEXT,
  receipt_hash TEXT,
  PRIMARY KEY (survey_id, responder_did)
);

CREATE TABLE survey_eligible_dids (
  survey_id TEXT NOT NULL,
  did TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (survey_id, did)
);

CREATE TABLE survey_tally_snapshots (
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  counts_by_question TEXT NOT NULL,
  ballot_count INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL,
  final INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (survey_id, computed_at)
);

CREATE TABLE survey_audit_events (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  event_type TEXT NOT NULL,
  event_payload TEXT NOT NULL,
  rolling_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sae_survey_id ON survey_audit_events(survey_id);
