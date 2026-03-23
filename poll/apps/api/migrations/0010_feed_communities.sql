-- Feed: Communities detected from mutual-follow graph
CREATE TABLE IF NOT EXISTS feed_communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  core_size INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0
);

-- Feed: Community membership (core + shell layers)
CREATE TABLE IF NOT EXISTS feed_community_members (
  community_id INTEGER NOT NULL REFERENCES feed_communities(id) ON DELETE CASCADE,
  did TEXT NOT NULL,
  shell INTEGER NOT NULL DEFAULT 0,      -- 0 = core, 1+ = shell layer
  mutual_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (community_id, did)
);

-- Feed: Bridge nodes (appear in multiple communities)
CREATE TABLE IF NOT EXISTS feed_bridges (
  did TEXT NOT NULL,
  community_ids TEXT NOT NULL,  -- JSON array of community IDs
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (did)
);

-- Feed: Engagement signals cached from Constellation
CREATE TABLE IF NOT EXISTS feed_engagement_cache (
  post_uri TEXT NOT NULL,
  engager_did TEXT NOT NULL,
  engagement_type TEXT NOT NULL,  -- 'like', 'repost', 'reply'
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_uri, engager_did, engagement_type)
);

-- Feed indexes
CREATE INDEX IF NOT EXISTS idx_feed_members_did ON feed_community_members(did);
CREATE INDEX IF NOT EXISTS idx_feed_members_community ON feed_community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_feed_engagement_post ON feed_engagement_cache(post_uri);
CREATE INDEX IF NOT EXISTS idx_feed_engagement_cached ON feed_engagement_cache(cached_at);
