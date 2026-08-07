// pocket-game.mjs — build a factory IN THE POCKET. The first thing on this page
// a stranger can LOSE.
//
// The operator's sentence has been true for the whole run: *"You cannot place a
// source next to a processor and watch something flow."* The campaign is six
// sliders over networks somebody else wired; the summon panel drops shapes into
// real foam with no goal. `pocketLevel.mjs` is the certificate that an ordered
// set of placements is BOTH pocket-legal AND fed — and until this file existed
// nothing imported it. This is that wiring.
//
// Same discipline as `campaign.mjs` and for the same reason: the control logic
// is a MODULE, not a set of event handlers, so `test/pocket-game.selftest.mjs`
// plays the whole thing through in node with no browser.
//
//     start()          dig the pocket, place nothing
//     select(key)      choose a palette entry
//     preview(point)   the verdict for putting it there, WITHOUT placing
//     place(point)     append it if it is legal
//     remove(id)       take one back      reset()  start over
//     verdict()        the certificate over everything placed so far
//     state()          a detached snapshot
//
// ------------------------------------------- THE POCKET IS NEVER PLANTED INTO
//
// The generated pocket is held PRISTINE and every verdict is recomputed from the
// ordered list. `pocketPlacementReport` already ACCUMULATES — object two is
// checked against object one's seeds — so replaying the list is the whole of the
// state, and `remove()` is then just a splice rather than an undo of a lattice
// rebuild (which `summon-session.mjs`'s header explains is not one line).
//
// THIS IS WHY THE MODULE DOES NOT USE `SummonSession`. That class really plants:
// its pocket advances, and its seed count grows. Feeding a grown pocket to
// `pocketLevelVerdict` — which appends the same objects' seeds again — would
// count every seed TWICE and check each object against a copy of itself. That is
// a wrong answer, not a crash, which is the worst kind.
//
// THE COST, stated plainly: the lattice does not visibly reform under a placed
// object. You see where it went, not the foam bending around it. Ask `lp-2fadad`
// is open on whether that reform IS the point; if it turns out to be, the switch
// is to a `SummonSession` plus `level.mjs`'s `networkFrom`, and it is a change
// inside this one file. That is why this was the reversible choice.
//
// ------------------------------------------------- TWO WAYS TO LOSE ----------
//
// What makes this a game rather than a packing puzzle is that the two halves of
// one verdict fail differently:
//
//   GEOMETRY   there is no room — the hull, the rock that was already there, or
//              a machine you yourself put down two moves ago.
//   PRODUCTION every machine is legally placed and the depot is STILL short,
//              because you chose the small smelter.
//
// Both come back from the same `pocketLevelVerdict` call, and section 3 of the
// gate asserts they are distinguishable in one verdict — an implementation that
// collapses them into "it did not work" fails.
//
// ------------------------------------------- THE VACUOUS TRAP, THIRD DOOR ----
//
// The ledger records it twice already: dropping a refused SINK leaves a network
// with no sinks, which `production.mjs` documents as vacuously satisfiable at
// margin 0, so `network.ok` goes TRUE on a level that just failed. It arrives
// here from a THIRD direction and this one is reachable on the first frame:
//
//     PLACE NOTHING AT ALL.
//
// `placement.every(ok)` is true of an empty list, `networkFrom` yields no nodes
// and no edges, `feasible` finds no sinks and returns `ok: true, margin: 0`. So
// `pocketLevelVerdict(...).ok === true` BEFORE THE PLAYER HAS DONE ANYTHING.
//
// That is not a bug in `pocketLevel.mjs` — it is the honest answer to "is
// everything placed legal and everything demanded supplied", and the answer for
// an empty factory is yes. It is a bug in anything that renders it as a win. So
// `won` requires `complete` as well, and `complete` is a property of the PALETTE
// (every slot filled) rather than of the verdict. §1 of the gate asserts the
// empty state has `ok: true` and `won: false` together, so an implementation
// that reads the certificate's `ok` as the win condition fails immediately.
//
// Node-and-browser, no dependencies, no randomness beyond the pocket seed.

import { generatePocket } from './foamworld.js';
import { constellation } from './solids.mjs';
import { DEFAULT_POCKET, DEFAULT_R } from './summon-session.mjs';
import { pocketPlacementReport, pocketLevelVerdict } from './pocketLevel.mjs';

/**
 * The one objective, frozen.
 *
 * `pocket` is `summon-session.mjs`'s own `DEFAULT_POCKET` rather than a fixture
 * invented here — it is the MACRO opts that `foamworld.selftest.mjs`,
 * `placement.selftest.mjs` and `multi-insert.selftest.mjs` have all already
 * proven reformable, so the ground under this game is ground three other gates
 * have stood on.
 *
 * THE NUMBERS, and every one of them is integer arithmetic on purpose so the
 * gate's expected values are exact rather than rounded:
 *
 *     vein        60 ore/min
 *     smelter     3 ore → 1 gear, capacity 15
 *     bigSmelter  3 ore → 1 gear, capacity 25
 *     depot       wants 20 gear/min
 *
 * Ore reaching a smelter is 60, so the supply-bound scale is 60/3 = 20 for both.
 * The SMALL smelter's capacity of 15 binds below that and it makes 15 gear —
 * five short. The BIG one's 25 does not bind, so it makes the full 20 and the
 * depot is exactly fed. That is the decision the level is made of, and it is a
 * decision with a cost: the big smelter is a bigger shape and needs more room.
 */
export const OBJECTIVE = Object.freeze({
  seed: 2,
  opts: Object.freeze({ ...DEFAULT_POCKET }),
  title: 'Feed the depot',
  blurb: 'Put a vein, a smelter and a depot into the rock, then wire them up. '
    + 'There is only so much room, and only one of the two smelters is big enough.',
  edges: Object.freeze([
    Object.freeze({ from: 'vein', to: 'smelter' }),
    Object.freeze({ from: 'smelter', to: 'depot' }),
    Object.freeze({ from: 'vein', to: 'bigSmelter' }),
    Object.freeze({ from: 'bigSmelter', to: 'depot' }),
  ]),
  /** Each slot must hold exactly one placed object for the objective to be
   *  COMPLETE. The two smelters share a slot, which is what makes them a choice
   *  rather than two more things to build. */
  slots: Object.freeze([
    Object.freeze(['vein']),
    Object.freeze(['smelter', 'bigSmelter']),
    Object.freeze(['depot']),
  ]),
  palette: Object.freeze([
    Object.freeze({
      key: 'vein', label: 'ore vein', solid: 'tetrahedron', r: DEFAULT_R,
      node: Object.freeze({ id: 'vein', kind: 'source', resource: 'ore', rate: 60 }),
    }),
    Object.freeze({
      key: 'smelter', label: 'small smelter', solid: 'cube', r: DEFAULT_R,
      node: Object.freeze({
        id: 'smelter', kind: 'processor', capacity: 15,
        inputs: Object.freeze([Object.freeze({ resource: 'ore', rate: 3 })]),
        outputs: Object.freeze([Object.freeze({ resource: 'gear', rate: 1 })]),
      }),
    }),
    Object.freeze({
      key: 'bigSmelter', label: 'big smelter', solid: 'octahedron', r: DEFAULT_R,
      node: Object.freeze({
        id: 'bigSmelter', kind: 'processor', capacity: 25,
        inputs: Object.freeze([Object.freeze({ resource: 'ore', rate: 3 })]),
        outputs: Object.freeze([Object.freeze({ resource: 'gear', rate: 1 })]),
      }),
    }),
    Object.freeze({
      key: 'depot', label: 'depot', solid: 'cube', r: DEFAULT_R,
      node: Object.freeze({ id: 'depot', kind: 'sink', resource: 'gear', demand: 20 }),
    }),
  ]),
});

/** Palette lookup by key. Exported so a renderer builds its buttons from the
 *  objective rather than from a hand-typed list of four labels. */
export function entryOf(key) {
  return OBJECTIVE.palette.find((p) => p.key === key) || null;
}

/** The slot a palette key belongs to, or -1. */
function slotOf(key) {
  return OBJECTIVE.slots.findIndex((s) => s.includes(key));
}

/**
 * The player-facing line for a state. Words live here rather than in the page so
 * a gate can compare what is rendered against something EXTERNAL — a regex over
 * the page can assert a sentence exists, never that it is the right one.
 *
 * No 'oracle', no 'feasible', no 'margin', no 'anisotropy': `campaign.mjs`'s
 * BANNED list is about ITS copy and is deliberately not imported, but the same
 * judgement applies to any words a stranger reads.
 */
export const LINES = Object.freeze({
  empty: 'Pick something on the left, then click the plan to put it down.',
  won: 'The depot is getting everything it asked for. That is the level.',
});

const GEOMETRY_WORDS = Object.freeze({
  hull: 'that reaches outside the pocket',
  pocket: 'there is already rock there',
  step: 'that is too close to something you have already built',
  self: 'that shape cannot hold itself apart',
  metric: 'that shape was cut for different ground',
});

/**
 * One sentence for a refusal. Every branch reads a FIELD off the argument;
 * nothing here re-types a threshold or a rate, so a sentence cannot drift away
 * from the verdict it describes.
 *
 * It accepts EITHER shape a caller has to hand: a `pocketPlacementReport` entry
 * (which carries `blame`) or a `preview()` result (which carries that entry
 * under `refusal`, and which is what `place()` remembers). Taking both is not
 * politeness — the only refusal a player can ever see is the second shape, and
 * requiring callers to reach inside it first is how the first version of this
 * function ended up unreachable.
 */
export function refusalLine(entry) {
  if (!entry) return null;
  // A SLOT refusal is a rule of the OBJECTIVE, not a fact about the rock, and it
  // is decided before any geometry exists — so it carries no `blame`. Falling
  // through to the geometry words would tell a player the ground was in the way
  // when what actually happened is that they already own the machine.
  if (entry.reason === 'slot' || entry.slotTaken) {
    const had = entryOf(entry.slotTaken);
    return `No — you have already built the ${had ? had.label : entry.slotTaken}. `
      + 'Take that back first if you want the other one.';
  }
  const e = entry.blame ? entry : (entry.refusal || entry);
  const what = GEOMETRY_WORDS[e.blame] || 'it will not go there';
  return `No — ${what}.`;
}

export class PocketGame {
  constructor({ objective = OBJECTIVE, minSeedGap } = {}) {
    this.objective = objective;
    this.minSeedGap = minSeedGap;
    this.pocket = null;        // PRISTINE, and it never changes after start()
    this.placed = [];          // ordered { id, key, con, node }
    this.selected = null;
    this.moves = 0;
    // THE LAST REFUSED ATTEMPT, and it has to be held here because nothing else
    // remembers it. A refusal is by definition NOT in `placed`, so it is not in
    // the verdict either — see `line()`.
    this.lastRefusal = null;
  }

  // ------------------------------------------------------------- lifecycle ---

  /** Dig the pocket and clear everything. Deterministic in the objective's seed:
   *  two games hold byte-identical pockets. */
  start() {
    this.pocket = generatePocket({ seed: this.objective.seed, ...this.objective.opts });
    this.placed = [];
    this.selected = null;
    this.moves = 0;
    this.lastRefusal = null;
    return this.state();
  }

  /** Same pocket, nothing placed. `start()` regenerates; this does not, because
   *  re-digging identical foam is the most expensive thing on the page. */
  reset() {
    this._started();
    this.placed = [];
    this.moves = 0;
    this.lastRefusal = null;
    return this.state();
  }

  _started() {
    if (!this.pocket) throw new Error('pocket-game: start() before anything else');
  }

  /** Choose what the next click puts down. Throws on an unknown key — it comes
   *  from a fixed enum in the program, not from the world. */
  select(key) {
    if (!entryOf(key)) throw new Error(`pocket-game: unknown palette key "${key}"`);
    this.selected = key;
    // Picking something else clears the last refusal: it was about the PREVIOUS
    // selection, and leaving it up would explain a machine the player is no
    // longer holding.
    this.lastRefusal = null;
    return this.selected;
  }

  // -------------------------------------------------------------- verdicts ---

  /** The constellation the current selection would build at `point`, built with
   *  the POCKET's own anisotropy — which is what makes a `metric` refusal
   *  unreachable here by construction rather than by luck. */
  _con(entry, point) {
    return constellation(entry.solid, {
      centre: point, r: entry.r, aniso: this.pocket.opts.aniso,
    });
  }

  /**
   * The verdict for putting the selection at `point`, placing nothing.
   *
   * Computed by replaying the whole ordered list WITH the proposed object on the
   * end and reading the last entry, so the answer accounts for everything
   * already down — the accumulation is `pocketLevel.mjs`'s and is not repeated
   * here.
   *
   * `{ ok, key, entry, con, refusal, reason, slotTaken }`. A `null` return means
   * there is nothing to preview: no selection, or a point that is not three
   * finite numbers. Those are caller faults rather than moves and they are not
   * counted as such.
   */
  preview(point) {
    this._started();
    const entry = entryOf(this.selected);
    if (!entry) return null;
    if (!Array.isArray(point) || point.length !== 3
      || !point.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;

    // A slot already filled is refused BEFORE any geometry is computed: it is a
    // rule of the objective, not a fact about the rock, and reporting it as a
    // collision would point the player at the wrong thing entirely.
    const taken = this.placed.find((p) => slotOf(p.key) === slotOf(entry.key));
    if (taken) {
      return {
        ok: false, key: entry.key, entry, con: null, slotTaken: taken.id,
        reason: 'slot', refusal: null,
      };
    }

    const con = this._con(entry, point);
    const objects = [...this.placed.map((p) => ({ id: p.id, con: p.con })), { id: entry.key, con }];
    const report = pocketPlacementReport(this.pocket, objects, this._opts());
    const mine = report[report.length - 1];
    return {
      ok: mine.ok, key: entry.key, entry, con,
      refusal: mine.ok ? null : mine, reason: mine.ok ? null : mine.reason,
      slotTaken: null,
    };
  }

  _opts() {
    return this.minSeedGap === undefined ? {} : { minSeedGap: this.minSeedGap };
  }

  /**
   * Put the selection down. `{ accepted, refusal, id }`.
   *
   * A REFUSED PLACE CHANGES NOTHING — not the list, not the pocket, not the move
   * count of things that landed. `moves` counts ATTEMPTS that reached the rock,
   * because "how many moves to reach a failure" is unanswerable otherwise; a
   * null preview (nothing selected, a bad point) never reached the rock and is
   * not a move.
   */
  place(point) {
    this._started();
    const p = this.preview(point);
    if (!p) return { accepted: false, refusal: null, id: null };
    // A SLOT refusal never reached the rock — `preview` returns it before any
    // geometry is computed — so it is not a move, which is what this method's
    // contract already said and what the counter did not do. It still becomes
    // `lastRefusal`: a rule the player has just run into is news whether or not
    // it cost them a move.
    if (p.reason !== 'slot') this.moves++;
    if (!p.ok) {
      this.lastRefusal = p;
      return { accepted: false, refusal: p.refusal || p, id: null };
    }
    this.lastRefusal = null;
    this.placed.push({ id: p.key, key: p.key, con: p.con, node: p.entry.node });
    return { accepted: true, refusal: null, id: p.key };
  }

  /** Take one back. Everything after it is re-judged on the next `verdict()`,
   *  because the verdict is recomputed from the list rather than stored. */
  remove(id) {
    this._started();
    const i = this.placed.findIndex((p) => p.id === id);
    if (i < 0) return false;
    this.placed.splice(i, 1);
    // Taking something back is very often the FIX for the refusal on screen
    // (a slot freed, a machine moved out of the way), so the sentence explaining
    // it must not outlive it.
    this.lastRefusal = null;
    return true;
  }

  // ------------------------------------------------------------- the answer --

  /** Every objective slot holds exactly one placed object. */
  complete() {
    return this.objective.slots.every((slot) => this.placed.some((p) => slot.includes(p.key)));
  }

  /**
   * The certificate — `pocketLevelVerdict` over the pristine pocket and the
   * ordered list, plus the two things the certificate cannot know:
   *
   *   `complete`  every slot filled. See the header: an EMPTY factory certifies
   *               `ok: true`, so `ok` alone is not a win.
   *   `won`       `complete && ok`. THIS is what a renderer shows.
   *
   * `edges` are filtered to the ids actually placed. Passing an edge that names
   * an unplaced node would make `feasible()` throw `edge names unknown node` —
   * a crash in front of a visitor rather than a verdict — and passing both
   * smelters' edges at once would be an unsplit fan-out, which it also refuses.
   * The slot rule above makes the second case unreachable; this filter makes the
   * first one impossible.
   */
  verdict() {
    this._started();
    const ids = new Set(this.placed.map((p) => p.id));
    const edges = this.objective.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const objects = this.placed.map((p) => ({ id: p.id, con: p.con, node: p.node }));
    const v = pocketLevelVerdict(this.pocket, objects, edges, this._opts());
    const complete = this.complete();
    return { ...v, complete, won: complete && v.ok };
  }

  /**
   * The one line under the plan. `null` for "nothing has been asked yet".
   *
   * Note which field it branches on: `won`, never the certificate's `ok`. The
   * empty factory certifies `ok: true` and this must not congratulate anybody
   * for it — the gate asserts exactly that.
   */
  line(v = this.verdict()) {
    if (v.won) return LINES.won;
    // THE LAST REFUSAL COMES FIRST, and it is the only route by which a player
    // ever sees a refusal sentence at all.
    //
    // The first version of this method looked for the refusal in the verdict —
    // `v.placement.find((r) => !r.ok)` — and that find is STRUCTURALLY ALWAYS
    // UNDEFINED, so all five geometry sentences were unreachable and a refused
    // click said nothing. The invariant, which the gate now asserts rather than
    // this method defending against: `placed` only ever holds objects `place()`
    // ACCEPTED, and `remove()` can only delete seeds, which strictly increases
    // every later object's clearance. So every entry in `v.placement` is legal,
    // always. A refusal is not in the verdict because it was never placed.
    //
    // It is ahead of the empty check on purpose: a first move that is refused
    // must say why, not fall back to "pick something and click".
    if (this.lastRefusal) return refusalLine(this.lastRefusal);
    if (!this.placed.length) return LINES.empty;
    // `deficits` is `{ sinkId, resource, demand, achieved }` — the shortfall is
    // NOT a field on it, so it is subtracted here from the two numbers that are.
    const short = (v.network.deficits || [])[0];
    if (v.complete && short) {
      return `The ${short.sinkId} is ${short.demand - short.achieved} ${short.resource} short `
        + `of the ${short.demand} it asked for.`;
    }
    return 'Something is still missing — the vein, a smelter or the depot.';
  }

  /** A detached snapshot. Nothing here aliases the game's own arrays, so a
   *  renderer holding one across a move cannot see it change under it. */
  state() {
    return {
      started: this.pocket !== null,
      seed: this.objective.seed,
      selected: this.selected,
      moves: this.moves,
      originCount: this.pocket ? this.pocket.seeds.length : 0,
      complete: this.pocket ? this.complete() : false,
      // Flat and all-primitive on purpose: a renderer wants to know THAT the
      // last attempt was refused and what to blame, and copying the refusal
      // object itself would alias `pocketPlacementReport`'s own arrays into a
      // snapshot this method promises is detached.
      lastRefusal: this.lastRefusal ? {
        key: this.lastRefusal.key,
        reason: this.lastRefusal.reason,
        blame: this.lastRefusal.refusal ? this.lastRefusal.refusal.blame : null,
        blockedBy: this.lastRefusal.refusal ? (this.lastRefusal.refusal.blockedBy ?? null) : null,
        slotTaken: this.lastRefusal.slotTaken,
      } : null,
      placed: this.placed.map((p) => ({
        id: p.id, key: p.key, label: entryOf(p.key).label,
        centre: p.con.centre.slice(),
        seeds: p.con.seeds.map((s) => s.slice()),
      })),
    };
  }
}
