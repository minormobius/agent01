// run.js — THE TRAINING RUN: a roguelike combat gauntlet the trainer fixture (play.wall) opens.
//
// The loop: step into the training platform → fight an ESCALATING ladder of solver-gated packs → each
// win banks POINTS (streak-scaled) and drops a REWARD ITEM (a spoils seed the caller mints into the
// pack) → spend points on tree.js's per-faction tech tree BETWEEN fights → a loss ends the run. It is a
// self-contained rehearsal: the tree build lives and dies with the run, so it never perturbs the world's
// persistent combat. The one thing that survives is the loot — victories drop real items into your pack.
//
// PERSISTENCE HOOK (deliberately left in, off by default): newRun() accepts { owned, points } — a
// persistent character build could inject a saved node set + point pool here, and finishRun() surfaces
// the final { owned, points } to save back. Flip the caller's TRAINER_PERSIST flag to turn roguelike →
// persistent; only the seed/save wiring changes, the kernel is source-agnostic (see tree.js's header).
//
// Pure + zero-dep: no DOM, no engine, no rollItem. Foe packs are built by the injected `packFor`
// (encounter.creepPack) + `certify` (encounter.certifyPack); reward items are returned as SEEDS the
// caller mints. That keeps this node-testable in isolation.

import { startingNodes, canBuy, buildLoadout, nodeById, TREES } from './tree.js';

// starting kit: tier-1 nodes owned, a small point pool so the first between-fight buy is possible.
export const POINTS_START = 2;
export const MAX_STAGE = 12;                 // the ladder tops out (a run is a session, not forever)

const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// points a win banks: a base per stage + a streak bonus (consecutive clears compound), so a clean run
// pays for the deep, expensive nodes. Pure.
export function earnFor(stage, streak) {
  return 1 + Math.floor(stage / 3) + Math.floor(Math.max(0, streak - 1) / 2);
}

// start a run for `faction`. `seed` fixes the ladder; `owned`/`points` are the PERSISTENCE HOOK —
// default to the roguelike fresh start (tier-1 nodes + POINTS_START).
export function newRun(faction, { seed = 1, owned = null, points = null } = {}) {
  return {
    faction,
    seed: seed >>> 0,
    stage: 0,                                // the ladder rung we're ABOUT to fight (0-based)
    streak: 0,                               // consecutive clears this run
    owned: owned ? [...owned] : startingNodes(faction),
    points: points == null ? POINTS_START : points,
    rewards: [],                             // item SEEDS banked from wins (caller mints them)
    over: false,
    cleared: false,                          // reached the top of the ladder
  };
}

// the loadout the run's player unit fights with — the tech tree folded into { kit, mods }.
export const loadoutOf = (run) => buildLoadout(run.faction, run.owned);

// a deterministic pseudo-room seed for the current stage, so the ladder is reproducible from (seed,stage).
const stageKey = (run) => 'train:' + run.seed + ':s' + run.stage;

// build + certify the current stage's foe pack. `packFor(worldSeed, chunkId, room, deck)` and
// `certify(player, pack, opts)` are injected (encounter.creepPack / certifyPack) so run.js stays dep-free.
// The stage doubles as the DECK depth, so the ladder escalates (bigger packs, meaner foes) as you climb.
export function stageFoes(run, player, { packFor, certify }) {
  const s = fnv(stageKey(run));
  const deck = Math.min(3, Math.floor(run.stage / 2));           // ramp the deck depth with the ladder
  const pack = packFor(s, run.stage, 0, deck);
  let foes = pack;
  try { const cert = certify(player, pack, { seed: s }); foes = (cert && cert.foes) || pack; } catch (e) {}
  return { foes, seed: s, deck };
}

// resolve a stage: `won` decides. A win banks points + a reward seed and advances (or crowns the run at
// the top of the ladder); a loss ends the run. Returns { points, reward, stage, over, cleared }.
export function resolveStage(run, won, rewardSeed) {
  if (run.over) return { points: run.points, reward: null, stage: run.stage, over: true, cleared: run.cleared };
  if (won) {
    run.streak += 1;
    const gained = earnFor(run.stage, run.streak);
    run.points += gained;
    const reward = (rewardSeed >>> 0);
    run.rewards.push(reward);
    run.stage += 1;
    if (run.stage >= MAX_STAGE) { run.over = true; run.cleared = true; }
    return { points: gained, reward, stage: run.stage, over: run.over, cleared: run.cleared };
  }
  run.streak = 0; run.over = true;
  return { points: 0, reward: null, stage: run.stage, over: true, cleared: false };
}

// spend points on a tree node (mutates the run). Returns true if bought.
export function buyNode(run, id) {
  if (run.over) return false;
  if (!canBuy(run.faction, run.owned, run.points, id)) return false;
  const n = nodeById(run.faction, id);
  run.owned.push(id);
  run.points -= n.cost;
  return true;
}

// what the caller shows in the tree UI: every node tagged owned / buyable / locked, tier-ordered.
export function treeView(run) {
  const owned = new Set(run.owned);
  const nodes = (TREES[run.faction] || []).slice().sort((a, b) => a.tier - b.tier).map((n) => ({
    ...n,
    state: owned.has(n.id) ? 'owned' : canBuy(run.faction, run.owned, run.points, n.id) ? 'buyable' : 'locked',
  }));
  return { faction: run.faction, points: run.points, nodes };
}

// the run summary the caller banks when it ends (loot always persists; owned/points feed the persistence hook).
export function finishRun(run) {
  return { cleared: run.cleared, stage: run.stage, streak: run.streak, rewards: run.rewards.slice(), owned: run.owned.slice(), points: run.points };
}

const RUN = { newRun, loadoutOf, stageFoes, resolveStage, buyNode, treeView, earnFor, finishRun, POINTS_START, MAX_STAGE };
export default RUN;
