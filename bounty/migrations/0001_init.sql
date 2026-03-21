-- Bounty board D1 schema
-- Anonymous bounty marketplace with Chaumian ecash reputation

-- RSA key pairs for rep minting (one per denomination)
CREATE TABLE IF NOT EXISTS mint_keys (
  denomination INTEGER PRIMARY KEY,  -- 1, 5, 10, 25
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
  reward_rep INTEGER NOT NULL DEFAULT 10,  -- rep payout on fulfillment
  stake_req INTEGER NOT NULL DEFAULT 0,    -- rep stake required to claim
  status TEXT NOT NULL DEFAULT 'open',     -- open, claimed, fulfilled, closed, expired
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Fulfillment submissions
CREATE TABLE IF NOT EXISTS fulfillments (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id),
  evidence_json TEXT NOT NULL,  -- JSON array of evidence items
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT
);

-- Track rep minting (prevent double-mint for same fulfillment)
CREATE TABLE IF NOT EXISTS mint_issuances (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillments(id),
  denomination INTEGER NOT NULL,
  blinded_msg_hash TEXT NOT NULL,  -- SHA-256 of blinded message (audit)
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Spent nullifiers (prevent double-spend of rep tokens)
CREATE TABLE IF NOT EXISTS spent_nullifiers (
  nullifier TEXT PRIMARY KEY,
  denomination INTEGER NOT NULL,
  context TEXT,  -- what it was spent on: 'stake:{bountyId}', 'transfer', etc.
  spent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Active stakes (rep locked against bounty claims)
CREATE TABLE IF NOT EXISTS stakes (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id),
  nullifiers_json TEXT NOT NULL,  -- JSON array of nullifiers being staked
  total_rep INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, returned, burned
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_kind ON bounties(kind);
CREATE INDEX IF NOT EXISTS idx_fulfillments_bounty ON fulfillments(bounty_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_status ON fulfillments(status);
CREATE INDEX IF NOT EXISTS idx_mint_issuances_fulfillment ON mint_issuances(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_stakes_bounty ON stakes(bounty_id);
CREATE INDEX IF NOT EXISTS idx_stakes_status ON stakes(status);
