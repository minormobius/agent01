// mine.js — THE MINE KERNEL. Pure, DOM-free, deterministic: the stardew wing of the farm, and the
// supply half of the alchemy vertical. Every level's layout is a pure function of (did-seed, depth) —
// no server, no stored maps; your mine is the same on every device, and a friend viewing your farm
// could re-derive every strike you claim. Node-tested (test/mine.selftest.mjs).
//
// SHAPE. A level is a W×H field of covered tiles. Digging a tile costs picks (dirt 1, rock 2); under
// it: nothing, a coin pouch, an ORE (one of the Seven planetary metals — lead/iron/copper/tin shallow,
// silver/gold/quicksilver deepening in, the classical nobility gradient), a GEM (rare, coins), a
// QUINTESSENCE SHARD (rarer — steadies a wobbly brew at the bench), or the LADDER (exactly one per
// level) that opens the next depth. Picks refill on entry once per REFILL_MS; bombs (a caustic brew's
// gift) add 4 picks each. The metals feed the bench's vessel tax (state.js PREP_METAL) — the
// herb→planet→metal correspondence walked with a shovel.

export const LEVEL_W = 6, LEVEL_H = 5;
export const PICKS_BASE = 12;
export const REFILL_MS = 8 * 3600 * 1000;   // a fresh set of picks at most every 8h — three runs a day
export const BOMB_PICKS = 4;
export const COST = { dirt: 1, rock: 2 };

// the Chaldean nobility gradient: what the ground gives at each depth band.
export const METALS = ['lead', 'iron', 'copper', 'tin', 'silver', 'gold', 'quicksilver'];
const ORE_BANDS = [
  { until: 3,  pool: ['lead', 'iron', 'iron', 'copper'] },
  { until: 7,  pool: ['lead', 'iron', 'copper', 'copper', 'tin', 'tin'] },
  { until: 12, pool: ['iron', 'copper', 'tin', 'silver', 'silver'] },
  { until: 1e9, pool: ['tin', 'silver', 'silver', 'gold', 'gold', 'quicksilver'] },
];
export const orePool = (depth) => ORE_BANDS.find((b) => depth < b.until).pool;

// seeded PRNG (repo house family — mulberry32 over an fnv mix of seed & depth)
export function levelRng(seed, depth) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (const ch of 'mine:' + depth) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 7), 1 | t); t ^= t + Math.imul(t ^ (t >>> 13), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// levelFor(seed, depth) → LEVEL_W*LEVEL_H tiles, row-major: { kind, cover, metal?, amount? }
//   kind:  'empty' | 'coin' | 'ore' | 'gem' | 'shard' | 'ladder'
//   cover: 'dirt' | 'rock' (what it costs to open)
// Exactly ONE ladder per level, never at index 0 (the entry corner), so a level is always finishable
// but never free. Deterministic: same (seed, depth) → identical field, forever.
export function levelFor(seed, depth) {
  const rng = levelRng(seed, depth);
  const n = LEVEL_W * LEVEL_H;
  const tiles = [];
  const pool = orePool(depth);
  for (let i = 0; i < n; i++) {
    const r = rng();
    let kind = 'empty', metal = null, amount = 0;
    if (r < 0.30) { kind = 'ore'; metal = pool[Math.floor(rng() * pool.length)]; amount = 1 + (rng() < 0.25 ? 1 : 0); }
    else if (r < 0.44) { kind = 'coin'; amount = 2 + Math.floor(rng() * (4 + Math.min(10, depth))); }
    else if (r < 0.48) { kind = 'gem'; amount = 10 + Math.floor(rng() * (8 + depth * 2)); }
    else if (r < 0.51) { kind = 'shard'; amount = 1; }
    const cover = rng() < (0.25 + Math.min(0.35, depth * 0.02)) ? 'rock' : 'dirt';
    tiles.push({ kind, cover, metal, amount });
  }
  const ladderAt = 1 + Math.floor(rng() * (n - 1));   // anywhere but the entry corner
  tiles[ladderAt] = { kind: 'ladder', cover: tiles[ladderAt].cover, metal: null, amount: 0 };
  return tiles;
}

// ── run state transitions (operate on farm.mine + the farm's loot pools; pure, return new farm) ──
const clone = (f) => JSON.parse(JSON.stringify(f));

// enter the mine: refill picks if the refill window has passed; (re)start at the surface of the run.
export function enterMine(farm, now) {
  const next = clone(farm);
  const m = next.mine;
  if (m.picks == null || now - (m.lastEntered || 0) >= REFILL_MS) {
    m.picks = PICKS_BASE + (m.picksBonus | 0);
    m.lastEntered = now;
    m.runDepth = m.depth;      // resume at your deepest floor — the ladder is progress, not a treadmill
    m.dug = {};
  }
  next.updatedAt = now;
  return { ok: true, farm: next, refillIn: Math.max(0, REFILL_MS - (now - m.lastEntered)) };
}

export function useBomb(farm, now) {
  if (!(farm.mine.bombs | 0)) return { ok: false, reason: 'no bombs — brew something caustic' };
  const next = clone(farm);
  next.mine.bombs--; next.mine.picks = (next.mine.picks | 0) + BOMB_PICKS;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// dig tile i of the current level. Loot lands straight in the farm's pools.
export function dig(farm, i, now) {
  const m = farm.mine;
  const key = m.runDepth + ':' + i;
  if (m.dug[key]) return { ok: false, reason: 'already dug' };
  const tiles = levelFor(farm.seed, m.runDepth);
  const t = tiles[i];
  if (!t) return { ok: false, reason: 'no such tile' };
  const cost = COST[t.cover] || 1;
  if ((m.picks | 0) < cost) return { ok: false, reason: 'out of picks — rest, or spend a bomb' };
  const next = clone(farm);
  const nm = next.mine;
  nm.picks -= cost;
  nm.dug[key] = 1;
  // keep the dug ledger bounded: only the current run's floors matter for display
  const keys = Object.keys(nm.dug);
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete nm.dug[k];
  let found = { kind: t.kind, metal: t.metal, amount: t.amount };
  if (t.kind === 'ore') { next.metals[t.metal] = (next.metals[t.metal] || 0) + t.amount; next.stats.oresMined += t.amount; }
  else if (t.kind === 'coin') next.coins += t.amount;
  else if (t.kind === 'gem') { next.coins += t.amount; next.stats.gemsFound++; }
  else if (t.kind === 'shard') next.shards = (next.shards | 0) + t.amount;
  else if (t.kind === 'ladder') { nm.runDepth++; if (nm.runDepth > nm.depth) nm.depth = nm.runDepth; }
  next.updatedAt = now;
  return { ok: true, farm: next, found, cost };
}

export default { LEVEL_W, LEVEL_H, PICKS_BASE, REFILL_MS, BOMB_PICKS, METALS, orePool, levelFor, levelRng, enterMine, dig, useBomb };
