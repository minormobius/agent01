-- Auto-managed OAuth client keypair (replaces OAUTH_SIGNING_*_KEY_JWK secrets)
CREATE TABLE IF NOT EXISTS oauth_client_keypair (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  private_key_jwk TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  kid TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
