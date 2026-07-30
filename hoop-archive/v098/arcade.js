// arcade.js — the ARCADE fixture: live forge cabinets, one RULESET PER CABINET.
//
// The second live fixture in the Tabard (the first is the reading-room TERMINAL).
// A `play`-role room's central component is an arcade cabinet (sim.js
// FIXTURE_ACTION: play→'arcade'); click it and it deals a real puzzle minted by
// fable/forge, the generator-of-game-forms one wing over. Pure, no DOM, no LLM;
// index.html draws the board + wires the keys, this module is the rules + economy.
//
// PLAY-TO-EARN. Each cabinet runs a DIFFERENT discovered law (picked from its
// stable chamber key), so the world's arcades are a little codex you wander. Beat
// a cabinet's puzzle and it pays out coins — the earning half of the economy the
// cafe (food) spends. Rewards scale with the oracle's par + difficulty.
//
// ONE CODEX, baked. These are forge's first six admitted laws — `buildCodex(6)`
// in fable/forge reproduces this genome+key list exactly (a permalink: the same
// laws on every machine, for ever). Each law's puzzle line is likewise
// deterministic, so puzzle p of cabinet L is the same board everywhere —
// atproto-stable, like the ship engine demands.

import { compile, describe } from './forge/dsl.js';
import { initialState, isWin } from './forge/engine.js';
import { puzzleFor } from './forge/atlas.js';

// forge codex laws № 1–22 — the FULL codex (baked from buildCodex(24)→22 admitted · fable/forge/js/foundry.js).
// The novelty gate admits exactly 22 measurably-distinct, playable laws from the 6-gene DSL; that's every
// distinct cabinet form. № 1–6 are unchanged (parity with the prior bake).
// key === GENE_KEYS.map(k => law[k]).join('|'); puzzleFor() seeds off the key, so
// it MUST match forge's lawKey() or the boards drift from fable.mino.mobi/forge.
export const ARCADE_LAWS = [
  { id: 1, name: "the Withering Discipline", key: "bounce|needClearAhead|toggle|mark|blocking|turnR", law: { motion: "bounce", guard: "needClearAhead", enter: "toggle", leave: "mark", markIs: "blocking", dirRule: "turnR" }, goal: "exit", nearestKnown: "paint (lights-like)" },
  { id: 2, name: "the Turning Rite", key: "leap|none|none|none|inert|turnL", law: { motion: "leap", guard: "none", enter: "none", leave: "none", markIs: "inert", dirRule: "turnL" }, goal: "collect", nearestKnown: "leap (checkers-like)" },
  { id: 3, name: "the Withering Custom", key: "leap|none|toggle|wall|inert|turnL", law: { motion: "leap", guard: "none", enter: "toggle", leave: "wall", markIs: "inert", dirRule: "turnL" }, goal: "collect", nearestKnown: "the Withering Discipline" },
  { id: 4, name: "the Withering Custom III", key: "slide|none|unmark|mark|blocking|reflect", law: { motion: "slide", guard: "none", enter: "unmark", leave: "mark", markIs: "blocking", dirRule: "reflect" }, goal: "collect", nearestKnown: "paint (lights-like)" },
  { id: 5, name: "the Severing Creed", key: "leap|none|toggle|wall|boost|keep", law: { motion: "leap", guard: "none", enter: "toggle", leave: "wall", markIs: "boost", dirRule: "keep" }, goal: "collect", nearestKnown: "paint (lights-like)" },
  { id: 6, name: "the One-Way Walk", key: "bounce|needClearAhead|none|wall|boost|keep", law: { motion: "bounce", guard: "needClearAhead", enter: "none", leave: "wall", markIs: "boost", dirRule: "keep" }, goal: "collect", nearestKnown: "the Severing Creed" },
  { id: 7, name: "the Staining Rite", key: "bounce|none|mark|none|inert|keep", law: { motion: "bounce", guard: "none", enter: "mark", leave: "none", markIs: "inert", dirRule: "keep" }, goal: "collect", nearestKnown: "paint (lights-like)" },
  { id: 8, name: "the Inking Gait", key: "step|none|mark|mark|boost|turnR", law: { motion: "step", guard: "none", enter: "mark", leave: "mark", markIs: "boost", dirRule: "turnR" }, goal: "collect", nearestKnown: "the Withering Custom" },
  { id: 9, name: "the Turning Custom", key: "bounce|none|none|none|inert|turnR", law: { motion: "bounce", guard: "none", enter: "none", leave: "none", markIs: "inert", dirRule: "turnR" }, goal: "collect", nearestKnown: "the Turning Rite" },
  { id: 10, name: "the Etching Law", key: "leap|none|unmark|mark|boost|keep", law: { motion: "leap", guard: "none", enter: "unmark", leave: "mark", markIs: "boost", dirRule: "keep" }, goal: "collect", nearestKnown: "the Severing Creed" },
  { id: 11, name: "the Inking Creed", key: "leap|needClearAhead|mark|mark|inert|keep", law: { motion: "leap", guard: "needClearAhead", enter: "mark", leave: "mark", markIs: "inert", dirRule: "keep" }, goal: "collect", nearestKnown: "the Etching Law" },
  { id: 12, name: "the Inking Walk", key: "slide|none|mark|none|inert|keep", law: { motion: "slide", guard: "none", enter: "mark", leave: "none", markIs: "inert", dirRule: "keep" }, goal: "collect", nearestKnown: "the Inking Creed" },
  { id: 13, name: "the Wandering Custom", key: "bounce|none|none|none|inert|keep", law: { motion: "bounce", guard: "none", enter: "none", leave: "none", markIs: "inert", dirRule: "keep" }, goal: "collect", nearestKnown: "walk (knack/morph)" },
  { id: 14, name: "the One-Way Creed", key: "bounce|needClearAhead|unmark|mark|boost|keep", law: { motion: "bounce", guard: "needClearAhead", enter: "unmark", leave: "mark", markIs: "boost", dirRule: "keep" }, goal: "inkAll", nearestKnown: "the Withering Custom III" },
  { id: 15, name: "the Etching Creed", key: "bounce|none|none|mark|boost|turnL", law: { motion: "bounce", guard: "none", enter: "none", leave: "mark", markIs: "boost", dirRule: "turnL" }, goal: "collect", nearestKnown: "the Inking Gait" },
  { id: 16, name: "the Inking Rite", key: "slide|none|toggle|mark|inert|turnR", law: { motion: "slide", guard: "none", enter: "toggle", leave: "mark", markIs: "inert", dirRule: "turnR" }, goal: "collect", nearestKnown: "the Withering Custom" },
  { id: 17, name: "the Severing Gait", key: "bounce|none|toggle|none|boost|reflect", law: { motion: "bounce", guard: "none", enter: "toggle", leave: "none", markIs: "boost", dirRule: "reflect" }, goal: "collect", nearestKnown: "paint (lights-like)" },
  { id: 18, name: "the Scribing Rite", key: "step|none|mark|mark|inert|reflect", law: { motion: "step", guard: "none", enter: "mark", leave: "mark", markIs: "inert", dirRule: "reflect" }, goal: "collect", nearestKnown: "the Staining Rite" },
  { id: 19, name: "the Inking Creed III", key: "bounce|none|mark|mark|inert|turnR", law: { motion: "bounce", guard: "none", enter: "mark", leave: "mark", markIs: "inert", dirRule: "turnR" }, goal: "collect", nearestKnown: "the Etching Creed" },
  { id: 20, name: "the Burning Rite", key: "slide|none|toggle|none|inert|turnR", law: { motion: "slide", guard: "none", enter: "toggle", leave: "none", markIs: "inert", dirRule: "turnR" }, goal: "collect", nearestKnown: "the Inking Rite" },
  { id: 21, name: "the Withering Manner", key: "step|none|toggle|none|inert|turnL", law: { motion: "step", guard: "none", enter: "toggle", leave: "none", markIs: "inert", dirRule: "turnL" }, goal: "exit", nearestKnown: "the Withering Custom" },
  { id: 22, name: "the Withering Custom IV", key: "slide|none|toggle|none|inert|reflect", law: { motion: "slide", guard: "none", enter: "toggle", leave: "none", markIs: "inert", dirRule: "reflect" }, goal: "exit", nearestKnown: "the Inking Walk" },
];

// stable string → law index, so a given cabinet always runs the same law.
export function lawIndexForKey(cabinetKey) {
  let h = 2166136261;
  const s = String(cabinetKey);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % ARCADE_LAWS.length;
}
export const arcadeRules = (lawIndex) => describe(ARCADE_LAWS[lawIndex].law);   // the rules card, in English, from the genome

// goal-type → the one line the HUD shows under the board.
export const GOAL_BLURB = {
  exit: 'reach the gate ⌖',
  collect: 'sweep every token ✦',
  inkAll: 'ink every open cell',
};

// Deal puzzle p of law `lawIndex` (deterministic). Returns a fresh game, or null
// if forge couldn't certify a board for this p (it tries 5 salts first).
export function newArcadeGame(lawIndex, p) {
  const e = ARCADE_LAWS[lawIndex]; if (!e) return null;
  const z = puzzleFor({ law: e.law, key: e.key }, p);
  if (!z) return null;
  return {
    lawIndex, law: e, p,
    world: z.world,
    stepFn: z.stepFn,
    par: z.solve.par,                 // the oracle's optimal — "can you match it?"
    solvePath: z.solve.path || [],    // the certified optimal move sequence — drives "watch the engine solve"
    report: z.report,                 // { interest, difficulty, diffTier, ... }
    goal: z.world.goal.type,
    state: initialState(z.world),
    moves: 0,
    won: false,
    history: [],
  };
}

// the coin payout for clearing a board — scales with the oracle's par + difficulty,
// so harder cabinets are worth more. Tunable; the spend side (cafe food) is priced
// against this in food/nutrition.mjs.
export function arcadeReward(game) {
  if (!game) return 0;
  return Math.round(4 + game.par * 0.8 + (game.report.difficulty || 0) / 10);
}

// Apply a move (d ∈ 0..3 = N E S W). Returns true if the law permitted it.
// Illegal moves (the law refused) leave the game untouched — the player learns
// the rule by bouncing off it, which is the whole point of a forged law.
export function arcadeMove(game, d) {
  if (!game || game.won) return false;
  const ns = game.stepFn(game.world, game.state, d);
  if (!ns) return false;
  game.history.push(game.state);
  game.state = ns;
  game.moves++;
  game.won = isWin(game.world, game.state);
  return true;
}

export function arcadeUndo(game) {
  if (!game || !game.history.length) return false;
  game.state = game.history.pop();
  game.moves--;
  game.won = false;
  return true;
}

export function arcadeReset(game) {
  if (!game) return;
  game.state = initialState(game.world);
  game.moves = 0;
  game.won = false;
  game.history = [];
}

// A flat, draw-ready snapshot of the board — index.html renders only this, so it
// never has to reach into engine state. cells[c] = { x, y, wall, mark, dyn,
// token, exit, agent }. dir is the agent's heading (0..3, N E S W).
export function arcadeBoard(game) {
  const w = game.world, s = game.state, N = w.W * w.H;
  const cells = new Array(N);
  for (let c = 0; c < N; c++) {
    cells[c] = {
      x: c % w.W, y: (c / w.W) | 0,
      wall: w.walls[c] === 1,
      mark: s.marks.has(c),
      dyn: s.dynWalls.has(c),
      token: s.tokens.has(c),
      exit: c === w.exit && w.goal.type !== 'collect',
      agent: c === s.agent,
    };
  }
  return { W: w.W, H: w.H, wrap: !!w.wrap, dir: s.dir, goal: w.goal.type, cells };
}
