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
