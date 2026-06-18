// arcade.js — the ARCADE fixture: a live cabinet that serves forge puzzles.
//
// The second LIVE FIXTURE in the Tabard (the first is the reading-room TERMINAL).
// A `play`-role room's central component is an arcade cabinet (see sim.js
// FIXTURE_ACTION: play→'arcade'); click it and it deals you a real puzzle minted
// by fable/forge — the generator-of-game-forms one wing over. Pure, no DOM, no
// LLM; index.html draws the board + wires the keys, this module is the rules.
//
// ONE RULESET, for now. The user asked for a single forged law so we can see the
// shape of it. We serve forge CODEX LAW № 1 — "the Withering Discipline" — the
// first law the foundry admits on its seeded candidate line, a permalink: the
// same law on every machine, for ever (`buildCodex(1)` in fable/forge reproduces
// the genome + key below exactly). Its puzzle line is likewise deterministic, so
// puzzle p is the same board everywhere — atproto-persistable, just like the
// ship engine demands. Add a second cabinet later by baking another codex entry.

import { compile, describe } from './forge/dsl.js';
import { initialState, isWin } from './forge/engine.js';
import { puzzleFor } from './forge/atlas.js';

// forge codex law № 1 — baked from `buildCodex(1)` (fable/forge/js/foundry.js).
// key === GENE_KEYS.map(k => law[k]).join('|'); puzzleFor() seeds off this key,
// so it MUST match forge's lawKey() or the boards drift from fable.mino.mobi/forge.
export const ARCADE_LAW = {
  id: 1,
  name: 'the Withering Discipline',
  key: 'bounce|needClearAhead|toggle|mark|blocking|turnR',
  law: { motion: 'bounce', guard: 'needClearAhead', enter: 'toggle', leave: 'mark', markIs: 'blocking', dirRule: 'turnR' },
  nearestKnown: 'paint (lights-like)',   // novelty 1.08 from the nearest hand-written law
};
export const arcadeRules = () => describe(ARCADE_LAW.law);   // the rules card, in English, straight from the genome

// the cabinet entry forge's atlas wants: { law, key }. Bake it once.
const ENTRY = { law: ARCADE_LAW.law, key: ARCADE_LAW.key };

// goal-type → the one line the HUD shows under the board.
export const GOAL_BLURB = {
  exit: 'reach the gate ⌖',
  collect: 'sweep every token ✦',
  inkAll: 'ink every open cell',
};

// Deal puzzle p of the cabinet's law (deterministic). Returns a fresh game, or
// null if forge couldn't certify a board for this p (it tries 5 salts first).
export function newArcadeGame(p) {
  const z = puzzleFor(ENTRY, p);
  if (!z) return null;
  return {
    p,
    world: z.world,
    stepFn: z.stepFn,
    par: z.solve.par,                 // the oracle's optimal — "can you match it?"
    report: z.report,                 // { interest, difficulty, diffTier, ... }
    goal: z.world.goal.type,
    state: initialState(z.world),
    moves: 0,
    won: false,
    history: [],
  };
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
// token, exit, agent, goal }. dir is the agent's heading (0..3, N E S W).
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
