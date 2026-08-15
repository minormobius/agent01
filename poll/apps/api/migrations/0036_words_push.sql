-- 0036_words_push.sql — turn notifications for words.mino.mobi.
--
-- Applied to the shared atpolls-db by .github/workflows/deploy-words.yml.
-- Idempotent, like 0035. A separate file rather than an edit to 0035 because
-- 0035 has already run in production and a migration that has shipped is
-- history, not a document.
--
-- WHY A CONFIG TABLE. Web Push needs a VAPID keypair, and the private half is
-- a secret. Worker secrets can only be set from the dashboard or CI, neither of
-- which is reachable from the sandbox that wrote this, so the key is generated
-- ONCE on first use and kept here (the self-provisioning pattern os-api uses
-- for CAP_SIGNING_KEY). The honest trade: the signing key lives in the same
-- database as the game data instead of in a secret store. What it authorises is
-- narrow — sending notifications to endpoints that already subscribed to this
-- site, nothing more, no read access to anything. To harden it later, set
-- WORDS_VAPID_PRIVATE/WORDS_VAPID_PUBLIC as worker secrets: the worker prefers
-- those over this table whenever they are present.

CREATE TABLE IF NOT EXISTS words_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS words_push (
  code       TEXT NOT NULL,          -- the game this subscription is for
  seat       INTEGER NOT NULL,       -- and the seat, so we only wake whose turn it is
  endpoint   TEXT NOT NULL,          -- the push service URL the browser gave us
  p256dh     TEXT NOT NULL,          -- the browser's public key (payload encryption)
  auth       TEXT NOT NULL,          -- and its auth secret
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, seat, endpoint)
);

-- The lookup on every move: "who do I wake up".
CREATE INDEX IF NOT EXISTS words_push_seat ON words_push (code, seat);
-- And the sweep when a subscription turns out to be dead (404/410 from the
-- push service): the same browser is usually subscribed to several games.
CREATE INDEX IF NOT EXISTS words_push_endpoint ON words_push (endpoint);
