// hoop/v095/sim.js — the light survival + fixture-action layer. Pure, no DOM, no LLM.
//
// FIXTURE REGISTRY: "turn on fixtures" = one table mapping (room role × which fixture) → an action. The
// central component and the grown wall fixture of a room each get a verb. Generalises the terminal case;
// every new fixture is one entry here. STAMINA: a sim resource that drains as you walk and is restored by
// a bed (or, later, food). CHEST: per-chamber persistent storage keyed by the chamber address (gid).

export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 0.5;                 // per walked tile
export const clampStamina = (s) => Math.max(0, Math.min(STAMINA_MAX, s == null ? STAMINA_MAX : s));
export const drainStamina = (s, tiles = 1) => clampStamina(clampStamina(s) - STAMINA_DRAIN * tiles);

// ── NOURISHMENT + HEALTH: the food half of the survival loop. ──
// Food is bought (cafe) for coins. Being NOURISHED slows the stamina drain (you
// go further on a full belly); nourishment ebbs as you walk, and once it hits
// zero — you're STARVING — your HEALTH starts to fall. Eating tops up nourishment
// (so it stops the bleed) + a little stamina + a little health. Pure data + math.
export const NOURISH_MAX = 100;
export const HEALTH_MAX = 100;
export const NOURISH_DRAIN = 0.22;                // per walked tile (slower than stamina — hunger creeps)
export const HEALTH_STARVE_DRAIN = 0.15;          // per walked tile, ONLY while nourish === 0
export const FED_STAMINA_RELIEF = 0.5;            // a full belly cuts the stamina drain by up to this fraction
export const clamp = (x, hi) => Math.max(0, Math.min(hi, x == null ? hi : x));
export const clampNourish = (n) => clamp(n, NOURISH_MAX);
export const clampHealth = (h) => clamp(h, HEALTH_MAX);

// One walking tick over `tiles`: drain nourishment, drain stamina (slowed if fed),
// and bleed health if starving. Returns a NEW {stamina, nourish, health} triple.
export function tickSurvival(s, tiles = 1) {
  const stamina = clampStamina(s.stamina), nourish0 = clampNourish(s.nourish), health = clampHealth(s.health);
  const fed = nourish0 / NOURISH_MAX;                                  // 0..1
  const drain = STAMINA_DRAIN * (1 - FED_STAMINA_RELIEF * fed);        // well-fed ⇒ stamina lasts
  const nourish = clampNourish(nourish0 - NOURISH_DRAIN * tiles);
  const starving = nourish0 <= 0;
  return {
    stamina: clampStamina(stamina - drain * tiles),
    nourish,
    health: starving ? clampHealth(health - HEALTH_STARVE_DRAIN * tiles) : health,
  };
}

// Eat a food item (from food/biomes.json): tops up nourishment + stamina + a
// little health. Returns a NEW triple. `food` carries {restoreStamina, nourish}.
export function applyFood(s, food) {
  return {
    stamina: clampStamina(clampStamina(s.stamina) + (food.restoreStamina || 0)),
    nourish: clampNourish(clampNourish(s.nourish) + (food.nourish || 0)),
    health: clampHealth(clampHealth(s.health) + Math.round((food.restoreStamina || 0) / 3)),
  };
}

// (room role × fixture kind) → action. component = the central emissive fixture; wall = the grown console.
export const FIXTURE_ACTION = {
  component: { learn: 'terminal', govern: 'terminal', worship: 'terminal', dwell: 'bed', grow: 'garden', play: 'arcade', serve: 'food' },
  wall: { dwell: 'chest' },
};
export function fixtureAction(role, kind) { return (FIXTURE_ACTION[kind] || {})[role] || null; }
export const isTerminalRole = (role) => fixtureAction(role, 'component') === 'terminal';

// chest store: { gid: [item, ...] }. Pure ops return a NEW store (+ the moved item for withdraw).
export function chestDeposit(store, gid, item) {
  const a = (store[gid] || []).slice(); a.push(item);
  return { ...store, [gid]: a };
}
export function chestWithdraw(store, gid, idx) {
  const a = (store[gid] || []).slice();
  if (idx < 0 || idx >= a.length) return { store, item: null };
  const [item] = a.splice(idx, 1);
  return { store: { ...store, [gid]: a }, item };
}
export const chestOf = (store, gid) => (store && store[gid]) || [];
