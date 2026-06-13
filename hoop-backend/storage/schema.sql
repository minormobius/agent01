-- World Engine schema. Run once against the local pgvector Postgres (or Neon later).
-- Identical SQL works against both; only the connection string changes.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram similarity for drift clustering

-- ─── World bible ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS world_bible (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version     int NOT NULL DEFAULT 1,
  season      int NOT NULL DEFAULT 1,
  markdown    text NOT NULL,          -- source of truth
  content     jsonb NOT NULL,         -- parsed structured form
  updated_at  timestamptz DEFAULT now()
);

-- ─── Vector store ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bible_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bible_id     uuid REFERENCES world_bible(id),
  section_path text NOT NULL,         -- e.g. "factions.quiet.motivation"
  content      text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  embedding    vector(768),           -- nomic-embed-text-v1.5
  season       int NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS bible_chunks_embedding_idx
  ON bible_chunks USING ivfflat (embedding vector_cosine_ops);

-- (collective_drift trigram index created with that table below)

-- ─── Content pool ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL,
  -- types: npc|creature|item|dialogue|dungeon_rule|plot_beat|lore_fragment|rumor
  content          jsonb NOT NULL,
  revelation_tier  int NOT NULL DEFAULT 1,
  narrative_tier   int NOT NULL DEFAULT 1,
  power_tier       int NOT NULL DEFAULT 1,
  tags             text[] NOT NULL DEFAULT '{}',
  world_refs       text[] NOT NULL DEFAULT '{}',  -- bible section_paths
  approved         bool NOT NULL DEFAULT false,
  needs_review     bool NOT NULL DEFAULT false,   -- retroactive review flag
  status           text NOT NULL DEFAULT 'active',
  -- status: active|retired|needs_regen
  usage_count      int NOT NULL DEFAULT 0,
  season           int NOT NULL DEFAULT 1,
  created_at       timestamptz DEFAULT now(),
  approved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS content_items_dispatch_idx
  ON content_items (type, revelation_tier, approved, status);
CREATE INDEX IF NOT EXISTS content_items_tags_idx
  ON content_items USING GIN (tags);

-- ─── Player state ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_state (
  id               text PRIMARY KEY,
  revelation_tier  int NOT NULL DEFAULT 1,
  narrative_tier   int NOT NULL DEFAULT 1,
  power_tier       int NOT NULL DEFAULT 1,
  xp               int NOT NULL DEFAULT 0,     -- drives deterministic power_tier (hot path)
  seen_ids         uuid[] NOT NULL DEFAULT '{}',
  letta_agent_id   text,
  season           int NOT NULL DEFAULT 1,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- xp added after the fact for existing deployments.
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS xp int NOT NULL DEFAULT 0;

-- ─── Crystallized placements ──────────────────────────────────────────────────
-- The "this specific thing, at this location, for THIS player" binding. A map
-- feature (feature_key) is ephemeral terrain until the player first interacts
-- with it; at that moment we dispatch ONE pool item and freeze the binding here,
-- so every later interaction returns the same item. This is the bridge between
-- the shared, infinite content pool and a player's persistent, concrete world.

CREATE TABLE IF NOT EXISTS player_placements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         text NOT NULL,
  feature_key       text NOT NULL,                 -- stable map-feature id
  content_type      text NOT NULL,
  content_item_id   uuid NOT NULL REFERENCES content_items(id),
  interaction_count int NOT NULL DEFAULT 1,
  first_seen_at     timestamptz DEFAULT now(),
  last_seen_at      timestamptz DEFAULT now(),
  UNIQUE (player_id, feature_key)
);

CREATE INDEX IF NOT EXISTS player_placements_player_idx
  ON player_placements (player_id);

-- ─── Pool watermark ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pool_depth (
  player_id            text NOT NULL,
  content_type         text NOT NULL,
  revelation_tier      int NOT NULL,
  available            int NOT NULL DEFAULT 0,
  low_watermark        int NOT NULL DEFAULT 10,
  target_depth         int NOT NULL DEFAULT 50,
  last_replenished_at  timestamptz,
  PRIMARY KEY (player_id, content_type, revelation_tier)
);

-- ─── Job queue ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,
  -- types: resolve_input|pregen_batch|replenish|world_delta_cascade
  --        deliver_retcon|season_synth
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending',
  -- status: pending|processing|done|failed
  player_id   text,
  priority    int NOT NULL DEFAULT 5,   -- 1 = highest
  created_at  timestamptz DEFAULT now(),
  picked_at   timestamptz,
  done_at     timestamptz,
  result      jsonb,
  error       text
);

CREATE INDEX IF NOT EXISTS jobs_pending_idx
  ON jobs (status, priority, created_at)
  WHERE status = 'pending';

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   text NOT NULL,
  type        text NOT NULL,
  -- types: input_resolved|tier_unlocked|retcon_delivered|npc_changed
  payload     jsonb,
  seen        bool NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_player_idx
  ON notifications (player_id, seen, created_at);

-- ─── Player inputs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_inputs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      text NOT NULL,
  text           text NOT NULL,
  context        jsonb,
  classified_as  text,
  -- classified_as: action_attempt|npc_question|note|rumor
  job_id         uuid REFERENCES jobs(id),
  created_at     timestamptz DEFAULT now()
);

-- ─── World deltas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS world_deltas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season           int NOT NULL DEFAULT 1,
  summary          text NOT NULL,
  changes          jsonb NOT NULL,      -- array of {section, old, new, certainty}
  invalidates_tags text[] NOT NULL DEFAULT '{}',
  enriches_tags    text[] NOT NULL DEFAULT '{}',
  certainty        text NOT NULL DEFAULT 'implied',
  -- certainty: canonical|rumored|implied
  proposed_by      text,
  drift_id         uuid,               -- collective_drift cluster this canonizes (nullable)
  approved_by      text,
  approved_at      timestamptz,
  cascade_status   jsonb NOT NULL DEFAULT
    '{"bible":"pending","vector_store":"pending","content_pool":"pending","agents":"pending"}',
  created_at       timestamptz DEFAULT now()
);

-- ─── Collective drift ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collective_drift (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL,       -- rumor|behavior_pattern|quest_skip
  content          text NOT NULL,
  player_count     int NOT NULL DEFAULT 1,
  resonance_score  float,
  spread_days      float,
  status           text NOT NULL DEFAULT 'accumulating',
  -- status: accumulating|proposed|canonized|retired
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collective_drift_content_trgm
  ON collective_drift USING gin (content gin_trgm_ops);

-- ─── Telemetry ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telemetry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        text,
  event_type       text NOT NULL,
  -- event_type: content_seen|tier_increment|input_queued|long_rest|npc_interaction
  content_item_id  uuid,
  payload          jsonb,
  created_at       timestamptz DEFAULT now()
);

-- ─── Gameplay: player-scoped state + the generic requirement gate ─────────────
-- The "doing-stuff" engine. Every verb (take/equip/talk) reads and writes these;
-- content_items.requires is the generic gate the dispatcher/dialogue evaluate.

-- The gate carried by content + dialogue choices. Empty {} = always available
-- (so existing content is unaffected until gates are authored).
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS requires jsonb NOT NULL DEFAULT '{}';

-- Player-scoped facts: flags, counters, reputation. The whole "what you've done"
-- surface the world reacts to. e.g. ('flag.opened_hatch', true), ('rep.keepers', 3).
CREATE TABLE IF NOT EXISTS player_facts (
  player_id   text NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL,
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (player_id, key)
);

-- Items the player carries — instances derived from crystallized item content.
CREATE TABLE IF NOT EXISTS player_inventory (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        text NOT NULL,
  content_item_id  uuid NOT NULL REFERENCES content_items(id),
  qty              int NOT NULL DEFAULT 1,
  props            jsonb NOT NULL DEFAULT '{}',
  acquired_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_inventory_player_idx ON player_inventory (player_id);

-- Which inventory item fills each equipment slot.
CREATE TABLE IF NOT EXISTS player_equipment (
  player_id     text NOT NULL,
  slot          text NOT NULL,
  inventory_id  uuid NOT NULL REFERENCES player_inventory(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, slot)
);

-- The NPC "memory block": per (player, npc) relationship state + dialogue position.
CREATE TABLE IF NOT EXISTS player_npc_state (
  player_id     text NOT NULL,
  npc_content_id uuid NOT NULL REFERENCES content_items(id),
  standing      int NOT NULL DEFAULT 0,
  flags         jsonb NOT NULL DEFAULT '{}',
  current_node  text,
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (player_id, npc_content_id)
);

-- HP is persisted (combat, deferred, will use it; max derived from power + equipment).
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS hp_current int;
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS hp_max int;
