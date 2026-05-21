-- airchat OAuth tables (port of poll's 0005_oauth.sql + 0006_oauth_keypair.sql).
--
-- Adds the ATProto OAuth flow alongside the existing app-password path.
-- Auth method is stored on the session row so the worker dispatches
-- Bearer (app-password) vs DPoP (OAuth) when making PDS calls.

-- Auto-managed OAuth client keypair (ES256). Singleton row. First
-- /client-metadata.json request seeds the row; no manual secret config.
CREATE TABLE IF NOT EXISTS airchat_oauth_keypair (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  private_key_jwk TEXT NOT NULL,
  public_key_jwk  TEXT NOT NULL,
  kid             TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Ephemeral state for in-flight OAuth flows. Single-use; deleted at
-- callback. 5-minute TTL (enforced via expires_at).
CREATE TABLE IF NOT EXISTS airchat_oauth_states (
  state             TEXT PRIMARY KEY,
  code_verifier     TEXT NOT NULL,
  dpop_key_jwk      TEXT NOT NULL,
  did               TEXT,
  pds_url           TEXT NOT NULL,
  auth_server_url   TEXT NOT NULL,
  token_endpoint    TEXT NOT NULL,
  dpop_nonce        TEXT,
  return_to         TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at        INTEGER NOT NULL
);

-- Extend airchat_sessions with OAuth-specific columns. SQLite has no
-- ADD COLUMN IF NOT EXISTS; wrap in a guard so re-applying the migration
-- doesn't fail. Each ALTER must be its own statement.
ALTER TABLE airchat_sessions ADD COLUMN auth_method TEXT DEFAULT 'app_password';
ALTER TABLE airchat_sessions ADD COLUMN dpop_key_jwk TEXT;
ALTER TABLE airchat_sessions ADD COLUMN oauth_scope TEXT;
