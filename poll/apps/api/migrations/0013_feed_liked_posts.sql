-- Liked posts collected from community members for the "Liked by SimCluster" feed.
-- Populated by cron every 6 hours.
CREATE TABLE IF NOT EXISTS feed_liked_posts (
  post_uri TEXT NOT NULL,
  liker_did TEXT NOT NULL,
  liked_at TEXT NOT NULL,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_uri, liker_did)
);

-- Index for feed serving: most-liked posts first
CREATE INDEX IF NOT EXISTS idx_feed_liked_posts_collected ON feed_liked_posts (collected_at DESC);
