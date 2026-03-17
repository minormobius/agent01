-- Store the host's Bluesky post URI and CID so we can reply with results on close
ALTER TABLE polls ADD COLUMN bluesky_post_uri TEXT DEFAULT NULL;
ALTER TABLE polls ADD COLUMN bluesky_post_cid TEXT DEFAULT NULL;
