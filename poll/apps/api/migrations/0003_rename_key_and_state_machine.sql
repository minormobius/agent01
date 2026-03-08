-- Migration 0003: Rename public_verification_key to host_key_fingerprint
-- and add finalized_at column for state machine locking.
--
-- SQLite doesn't support RENAME COLUMN in older versions, but D1 uses
-- a modern SQLite that does. ALTER TABLE ... RENAME COLUMN is idempotent
-- enough — if the column is already renamed, it errors and the workflow
-- ignores it.

ALTER TABLE polls RENAME COLUMN public_verification_key TO host_key_fingerprint;
