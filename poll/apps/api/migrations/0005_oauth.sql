-- OAuth state table (ephemeral, 5-minute TTL, deleted on callback)
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  dpop_key_jwk TEXT NOT NULL,
  did TEXT,
  pds_url TEXT NOT NULL,
  auth_server_url TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  dpop_nonce TEXT,
  return_to TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Add OAuth columns to sessions table
ALTER TABLE sessions ADD COLUMN dpop_key_jwk TEXT;
ALTER TABLE sessions ADD COLUMN auth_method TEXT DEFAULT 'app_password';
