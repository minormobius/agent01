-- Mega Bounty Board — D1 Schema

CREATE TABLE IF NOT EXISTS oauth_client_keypair (
  id INTEGER PRIMARY KEY DEFAULT 1,
  private_key_jwk TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  kid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  dpop_key_jwk TEXT NOT NULL,
  did TEXT NOT NULL,
  pds_url TEXT NOT NULL,
  auth_server_url TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  dpop_nonce TEXT,
  return_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  handle TEXT NOT NULL,
  pds_url TEXT NOT NULL,
  refresh_token TEXT,
  dpop_key_jwk TEXT,
  auth_method TEXT NOT NULL DEFAULT 'oauth',
  oauth_scope TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_did ON sessions(did);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
