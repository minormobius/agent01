-- Bounty board D1 schema
-- Manages bounties, fulfillments, trophy issuance, and nullifiers

-- RSA key pairs for trophy signing (one per tier)
CREATE TABLE IF NOT EXISTS trophy_keys (
  tier TEXT PRIMARY KEY,  -- 'bronze', 'silver', 'gold'
  public_key_jwk TEXT NOT NULL,
  private_key_jwk TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bounty requests
CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT,  -- JSON array
  reward_amount TEXT,
  reward_currency TEXT DEFAULT 'REPUTATION',
  reward_method TEXT DEFAULT 'reputation',
  trophy_tier TEXT DEFAULT 'bronze',
  status TEXT NOT NULL DEFAULT 'open',
  created_by_did TEXT,  -- NULL for anonymous
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Fulfillment submissions
CREATE TABLE IF NOT EXISTS fulfillments (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id),
  evidence_json TEXT NOT NULL,  -- JSON array of evidence items
  notes TEXT,
  geo_lat REAL,
  geo_lon REAL,
  captured_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
  submitted_by_did TEXT,  -- NULL for anonymous
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT
);

-- Track which fulfillments have been trophy-signed (prevent double-issuance)
CREATE TABLE IF NOT EXISTS trophy_issuances (
  fulfillment_id TEXT PRIMARY KEY REFERENCES fulfillments(id),
  tier TEXT NOT NULL,
  blinded_msg_hash TEXT NOT NULL,  -- SHA-256 of blinded message (for audit)
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nullifier registry (prevent trophy replay/double-presentation)
CREATE TABLE IF NOT EXISTS trophy_nullifiers (
  nullifier TEXT PRIMARY KEY,
  presented_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_kind ON bounties(kind);
CREATE INDEX IF NOT EXISTS idx_fulfillments_bounty ON fulfillments(bounty_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_status ON fulfillments(status);
