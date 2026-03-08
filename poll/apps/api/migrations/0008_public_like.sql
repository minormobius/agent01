-- Add support for public_like poll mode (like-based voting via Bluesky)
-- bluesky_option_posts stores JSON array of {uri, cid} for each option's reply post
ALTER TABLE polls ADD COLUMN bluesky_option_posts TEXT DEFAULT NULL;
