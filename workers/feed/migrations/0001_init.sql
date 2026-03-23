-- Communities detected from mutual-follow graph
CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  core_size INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0
);

-- Community membership (core + shell layers)
CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  did TEXT NOT NULL,
  shell INTEGER NOT NULL DEFAULT 0,      -- 0 = core, 1+ = shell layer
  mutual_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (community_id, did)
);

-- Bridge nodes (appear in multiple communities)
CREATE TABLE IF NOT EXISTS bridges (
  did TEXT NOT NULL,
  community_ids TEXT NOT NULL,  -- JSON array of community IDs
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (did)
);

-- Engagement signals cached from Constellation
CREATE TABLE IF NOT EXISTS engagement_cache (
  post_uri TEXT NOT NULL,
  engager_did TEXT NOT NULL,
  engagement_type TEXT NOT NULL,  -- 'like', 'repost', 'reply'
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_uri, engager_did, engagement_type)
);

-- Indexes for feed queries
CREATE INDEX IF NOT EXISTS idx_members_did ON community_members(did);
CREATE INDEX IF NOT EXISTS idx_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_engagement_post ON engagement_cache(post_uri);
CREATE INDEX IF NOT EXISTS idx_engagement_cached ON engagement_cache(cached_at);
