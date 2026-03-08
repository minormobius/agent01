-- Add host_public_key column for v2 (RSA blind signature) polls.
-- Stores the RSA public key as JWK JSON string. NULL for v1 polls.
ALTER TABLE polls ADD COLUMN host_public_key TEXT;
