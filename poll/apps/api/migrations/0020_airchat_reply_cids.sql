-- airchat: store reply target CIDs in the voices cache.
--
-- The lexicon's reply field is a pair of strongRefs ({uri, cid}). When
-- a user replies to an existing voice, we need both the parent's and
-- the root's CIDs to construct a valid reply field. Previously we only
-- stored the URIs, which meant we couldn't build replies-to-replies
-- without a server-side getRecord lookup. Cheaper to denormalize.
--
-- Idempotent: ALTER TABLE ADD COLUMN errors if the column already
-- exists, but the workflow's `|| true` swallows that.

ALTER TABLE airchat_voices ADD COLUMN reply_root_cid TEXT;
ALTER TABLE airchat_voices ADD COLUMN reply_parent_cid TEXT;
