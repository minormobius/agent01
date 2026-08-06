// plant/summon-session.mjs — the controller between a click and the foam.
//
// Everything under a summon is built and gated. `solids.mjs` makes the
// constellation, `placement.mjs` says whether it fits and names what it hits,
// `foamworld.js`'s `reformPocketAll` plants it as one transaction or refuses
// with a named cause. NOTHING CONNECTED THEM TO A PLAYER. This file is that
// connection, and it is deliberately the half a test can drive: **no DOM, no
// events, no rendering** — a state machine with four verbs.
//
//     start(seed)            generate a real pocket; reset everything
//     candidates(opts)       where a summon of the current solid would be legal
//     preview(point, opts)   the verdict for one point, WITHOUT planting
//     place(solid, point)    the transaction: it lands whole, or nothing changes
//
// `history()` / `undo()` are deliberately absent — see the note at the foot.
//
// ------------------------------------------------- what a session ADDS -------
//
// A thin wrapper over `reformPocketAll` would be worth nothing; the transaction
// already exists. Three things only a session can do, because only a session
// remembers what the player has done:
//
//  1. THE POCKET ADVANCES. Every verdict after a successful summon is computed
//     against the pocket AS THE PLAYER LEFT IT, not against the generated one.
//     A spot that was legal a move ago is refused now, and that is the whole
//     mechanic — needing clear ground to build is the oldest rule in the genre.
//
//  2. BLAME. `reformPocketAll` says "seed 71 is 1.4m away". A player cannot use
//     that. A session knows seed 71 is the east face of the cube THEY summoned
//     on move 1, so every refusal is attributed:
//
//         blame:'player'  — it hit something the player built (with `blameMove`,
//                           `blameSolid`, `blameCentre` — enough to light it up)
//         blame:'pocket'  — it hit the generated foam. Nothing they did.
//         blame:'hull'    — it is outside the placeable box, named by wall.
//         blame:'self'    — two seeds of THIS summon fight each other.
//         blame:'foam'    — closure or nav: the rebuild itself refused.
//         blame:'caller'  — a bad argument. A bug, not a move.
//
//     'player' vs 'pocket' is the distinction a player needs and it is not
//     derivable from the transaction's return value alone. It is the reason
//     this file is a session and not a function.
//
//  3. A MOVE COUNT that includes refusals. `moves` counts ATTEMPTS; `placed`
//     counts successes. A refused summon is a move the player made and it must
//     show up as one, or "how many moves to reach a failure" is unanswerable.
//
// ------------------------------------------------- preview is NOT a promise --
//
// `preview` runs `placement.mjs`'s predicate, which is a NECESSARY condition
// only — that file's header is explicit and this one repeats it because a caller
// who forgets it ships a lie:
//
//     preview(p).ok === false  ⟹  place() will refuse.        A THEOREM.
//     preview(p).ok === true   ⟹  nothing. No KNOWN obstruction.
//
// `place` can still refuse for `closure` (the reformed complex fails its Euler
// gate) or `nav` (the target chamber loses its floor), and neither is decidable
// without doing the rebuild. So a UI greys out `ok:false` ground with certainty,
// and treats a green highlight as an invitation rather than a guarantee.
//
// ------------------------------------------------- a non-finite point --------
//
// `preview` and `place` REFUSE a point that is not three finite numbers, with
// `reason:'point'` and `blame:'caller'`.
//
// **`placement.mjs` refuses it too, and this guard no longer compensates for
// anything.** `hullViolation` tests `Number.isFinite` explicitly and returns a
// hull refusal carrying `nonFinite:true` and `depth:Infinity`, naming the axis
// and the wall — so the predicate, the kernel and this session all agree that a
// raycast which missed is not somewhere to build. THIS GUARD PREDATES THAT FIX:
// it was written when `legalSeed` still answered `ok:true` for a NaN point,
// because every ordered comparison against NaN is false and a chain of `<`/`>`
// falls through to "fine".
//
// It is kept, and not on the grounds that two checks are safer than one. It is
// kept because the two layers answer DIFFERENT QUESTIONS. `placement.mjs` says
// the point is outside the hull — true, and useless to a player. Only the
// session can say `blame:'caller'`: a malformed point is a BUG IN THE CALLER
// rather than a move somebody made, so it must not advance `moves` and must not
// be rendered as a refusal the player caused. No hull refusal can express that,
// and it is the distinction this file exists to make. The guard also catches
// what `placement.mjs` structurally cannot — a `null` or a non-array passed as
// the WHOLE point, which `legalSeed` would throw a TypeError on.
//
// Both halves are pinned, so the paragraph above cannot quietly become a lie
// again: `placement.selftest.mjs` §7 asserts the predicate's refusal (reason,
// axis, wall, `nonFinite`) for NaN, ±Infinity, a missing coordinate and an
// un-coerced string; `summon-session.selftest.mjs` §8 asserts this session's
// own contract — `move:null`, `blame:'caller'`, `reason:'point'`,
// `pocketChanged:false`.
//
// An unknown solid name THROWS instead, and the asymmetry is deliberate: the
// solid comes from a fixed enum in the program, a point comes from the world.
//
// ------------------------------------------------- `first` and `refusal` -----
//
// Both verbs return BOTH names for the first refusal, set to the SAME OBJECT,
// and `null` on both when there is none. They are aliases, not two fields.
//
// They exist because `place()` used to call it `refusal` while `preview()`
// called it `first`, so a renderer wanting one function for both verdicts had
// to write `res.refusal || res.first` — which is silently wrong the moment
// either verb gains the other's field, because `||` would then pick whichever
// name happened to be non-null rather than the current one. `summon-view.js`
// carries exactly that expression, and it is now redundant rather than
// load-bearing.
//
// `first` is the name the layers underneath already use: `legalSummon` returns
// `{ refusals, first }` and so does `reformPocketAll`. `place()` was the only
// thing in the stack that renamed it. NEITHER NAME IS BEING REMOVED — a rename
// that misses a caller is strictly worse than the asymmetry — and
// `summon-session.selftest.mjs` §10 pins both, on both verbs, on all four
// paths, including that they are `null` together on a success.
//
// ------------------------------------------------- `summonSeed` --------------
//
// THE SECOND ASYMMETRY, and it was worse than the first because it was
// invisible. `preview`'s refusals came from `legalSummon` and named the
// offending part of the shape `summonSeed`; `place`'s came from
// `reformPocketAll` and named it `point`. A renderer doing
// `highlight(rf.summonSeed)` worked perfectly on every preview and highlighted
// `undefined` — nothing at all, with no error — for exactly the summons the
// player actually attempted. `placement.mjs`'s own docstring promises "every
// refusal carries `summonSeed`", and for the place path that promise was broken.
//
// They mean the identical thing: the index within `con.seeds`, 0 being the
// centre. `place()` hands `con.seeds` to the kernel in order and the kernel
// indexes the array it was given, so the two indices are the same number by
// construction — not by coincidence, and §10 asserts it on one geometry through
// both verbs rather than trusting the argument.
//
// So `_attribute` SETS `summonSeed` from `point` (and `otherSummonSeed` from
// `otherPoint` on a `batch` refusal) when the kernel answered. Both original
// names keep their values: a rename that misses a caller is strictly worse than
// an alias, which is the same call `first`/`refusal` made above.
//
// ONE REFUSAL CLASS IS EXEMPT AND MUST STAY EXEMPT: `closure` and `nav` carry
// `points` — plural, the whole batch — and no index at all, because a rebuild
// that failed its Euler gate or lost its floor cannot be blamed on one seed.
// They get no `summonSeed`, and the gate asserts they still have none.
//
// ------------------------------------------------- what is NOT here ----------
//
// `undo()`. It looks like one line — keep the old pocket, swap it back — and it
// is not: membrane open/closed state is carried by the caller (`foamworld.js`
// says so at `reformPocket`), so an undo that restores a pocket without
// restoring what the player had opened would silently reset the level. Out of
// scope, and the session keeps enough (`placed`, with every centre and every
// planted index) that a later ticket can build it without changing this API.
//
// Node-and-browser, no dependencies, no randomness beyond the pocket seed.

import { generatePocket, reformPocketAll } from './foamworld.js';
import { constellation, SOLID_NAMES } from './solids.mjs';
import { summonAt, hullBounds, nearestSeed, MIN_SEED_GAP } from './placement.mjs';

/** The summon inradius the whole project has used since `solids.mjs` shipped. */
export const DEFAULT_R = 1.6;

/** The MACRO fixture — few big rooms. The same opts `foamworld.selftest.mjs`,
 *  `placement.selftest.mjs` and `multi-insert.selftest.mjs` already plant into,
 *  so a session's pocket is one three other gates have proven reformable. */
export const DEFAULT_POCKET = {
  nx: 4, nz: 4, layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6,
};

/** Every value `blame` can take. Exported so a renderer can switch on it
 *  exhaustively rather than string-matching and missing one. */
export const BLAME = ['hull', 'pocket', 'player', 'self', 'foam', 'caller'];

function badPoint(p) {
  return !Array.isArray(p) || p.length !== 3
    || !p.every((v) => typeof v === 'number' && Number.isFinite(v));
}

export class SummonSession {
  /**
   * `solid` and `r` are the CURRENT selection — what `preview` and
   * `candidates` answer about when not told otherwise. `place` always takes its
   * solid explicitly, because planting is the one action worth being loud about.
   */
  constructor({ solid = 'cube', r = DEFAULT_R, pocket = DEFAULT_POCKET, minSeedGap = MIN_SEED_GAP } = {}) {
    if (!SOLID_NAMES.includes(solid)) {
      throw new Error(`summon-session: unknown solid "${solid}" (have ${SOLID_NAMES.join(', ')})`);
    }
    this.solid = solid;
    this.r = r;
    this.minSeedGap = minSeedGap;
    this.pocketOpts = { ...pocket };
    this.pocket = null;
    this.seed = null;
    this.originCount = 0;   // seeds the GENERATOR put there — the boundary between
    this.placed = [];       // "the world" and "what the player did"
    this.moves = 0;
  }

  // ------------------------------------------------------------- lifecycle ---

  /** Generate a pocket and reset the session onto it. Deterministic in `seed`:
   *  two sessions started on the same seed hold byte-identical pockets. */
  start(seed = 1) {
    this.pocket = generatePocket({ seed, ...this.pocketOpts });
    this.seed = seed;
    this.originCount = this.pocket.seeds.length;
    this.placed = [];
    this.moves = 0;
    return this.state();
  }

  /** Change the selected solid. Throws on an unknown name — see the header. */
  select(solid) {
    if (!SOLID_NAMES.includes(solid)) {
      throw new Error(`summon-session: unknown solid "${solid}" (have ${SOLID_NAMES.join(', ')})`);
    }
    this.solid = solid;
    return this.solid;
  }

  _started() {
    if (!this.pocket) throw new Error('summon-session: start() before anything else');
  }

  /** A plain, copied snapshot for a renderer. The pocket is NOT copied — it is
   *  large and immutable-by-convention (every insert returns a new one). */
  state() {
    return {
      started: this.pocket !== null,
      seed: this.seed,
      solid: this.solid,
      r: this.r,
      moves: this.moves,
      seedCount: this.pocket ? this.pocket.seeds.length : 0,
      originCount: this.originCount,
      plantedCount: this.pocket ? this.pocket.seeds.length - this.originCount : 0,
      placed: this.placed.map((p) => ({
        move: p.move, solid: p.solid, centre: p.centre.slice(), r: p.r,
        first: p.first, count: p.count, planted: p.planted.slice(),
      })),
    };
  }

  // ----------------------------------------------------------- attribution ---

  /**
   * Which placement planted `seedIndex`, or `null` when the generator did.
   *
   * Sound because seed indices are STABLE: `rebuildWith` builds the new seed
   * list as `[...old, ...new]`, so an insert only ever appends and an index
   * minted on move 1 still means the same seed on move 9.
   */
  ownerOf(seedIndex) {
    if (!(seedIndex >= this.originCount)) return null;   // also catches undefined/NaN
    for (const p of this.placed) {
      if (seedIndex >= p.first && seedIndex < p.first + p.count) return p;
    }
    return null;
  }

  /** Copy a raw refusal and add `blame` (and, when the player is to blame, which
   *  of their summons did it). Handles both vocabularies — `placement.mjs` says
   *  `self` for a summon fighting itself, the kernel says `batch` — because a
   *  caller should not have to know which layer answered. */
  _attribute(rf) {
    const out = { ...rf };

    // WHICH PART OF THE SHAPE — normalised to `summonSeed` on both verbs.
    //
    // `placement.mjs` calls it `summonSeed` (the index within `con.seeds`, 0
    // being the centre); the kernel calls it `point` (the index within the batch
    // it was handed). They are THE SAME INDEX, because `place()` gives
    // `reformPocketAll` exactly `con.seeds`, in order, and the kernel indexes the
    // array it was given. See the header.
    //
    // ADD, NEVER RENAME. `point` and `otherPoint` keep their values and their
    // meanings, so nothing that reads them breaks and no caller had to be found.
    // An existing `summonSeed` is never overwritten: the preview path already
    // carries the authoritative one.
    if (typeof out.point === 'number' && out.summonSeed === undefined) {
      out.summonSeed = out.point;
    }
    if (typeof out.otherPoint === 'number' && out.otherSummonSeed === undefined) {
      out.otherSummonSeed = out.otherPoint;
    }
    // `closure` and `nav` are DELIBERATELY left with no index. They carry
    // `points` — plural, the whole batch — because a rebuild that failed its
    // Euler or nav gate cannot honestly be attributed to one seed, and inventing
    // an index for them would be a lie a renderer would then highlight.

    if (rf.reason === 'seed') {
      const owner = this.ownerOf(rf.seedIndex);
      out.blame = owner ? 'player' : 'pocket';
      if (owner) {
        out.blameMove = owner.move;
        out.blameSolid = owner.solid;
        out.blameCentre = owner.centre.slice();
      }
    } else if (rf.reason === 'hull') {
      out.blame = 'hull';
    } else if (rf.reason === 'self' || rf.reason === 'batch') {
      out.blame = 'self';
    } else if (rf.reason === 'closure' || rf.reason === 'nav') {
      out.blame = 'foam';
    } else {
      out.blame = 'caller';                       // 'empty', 'metric', 'point'
    }
    return out;
  }

  // --------------------------------------------------------------- verdicts ---

  /**
   * The verdict for one point, planting nothing.
   *
   * `{ ok, solid, centre, r, con, refusals, first, refusal }`. Read the header
   * before treating `ok:true` as a promise: it is not one.
   *
   * `first` and `refusal` are the SAME OBJECT — see the header. `place()`
   * returns the same pair, so one renderer serves both verbs.
   */
  preview(point, opts = {}) {
    this._started();
    const solid = opts.solid ?? this.solid;
    const r = opts.r ?? this.r;
    const rotate = opts.rotate ?? 0;
    if (!SOLID_NAMES.includes(solid)) {
      throw new Error(`summon-session: unknown solid "${solid}" (have ${SOLID_NAMES.join(', ')})`);
    }
    if (badPoint(point)) {
      const rf = this._attribute({ reason: 'point', at: Array.isArray(point) ? point.slice() : point });
      return { ok: false, solid, centre: null, r, con: null, refusals: [rf], first: rf, refusal: rf };
    }
    const s = summonAt(this.pocket, solid, point, { r, rotate, minSeedGap: this.minSeedGap });
    const refusals = s.verdict.refusals.map((x) => this._attribute(x));
    const first = refusals.length ? refusals[0] : null;
    return {
      ok: s.ok, solid, centre: point.slice(), r, con: s.con,
      refusals, first, refusal: first,
    };
  }

  /**
   * Where a summon of `solid` would be legal, swept over a grid.
   *
   * `{ solid, r, step, ys, clear, scanned, found, list, truncated }`. `list` is
   * capped at `limit`, and `found` reports how many there really were, so a cap
   * can never read as "that is all of them" — `truncated` states it outright.
   *
   * `clear` asks for MORE room than legality requires (anisotropic metres to the
   * nearest pocket seed). Legality is 1.5m and a summon at exactly 1.5m is legal
   * and cramped; a caller wanting comfortable candidates asks for it explicitly.
   *
   * Uses the cheap predicate throughout — no rebuilds — so this is a highlight
   * layer, not a promise. Deterministic: ascending x, then z, then `ys` in order.
   */
  candidates(opts = {}) {
    this._started();
    const solid = opts.solid ?? this.solid;
    const r = opts.r ?? this.r;
    const step = opts.step ?? 7;
    const clear = opts.clear ?? 0;
    const limit = opts.limit ?? 64;
    const b = hullBounds(this.pocket);
    const ys = opts.ys ?? [0.35, 0.5, 0.65].map((f) => b.y[0] + f * (b.y[1] - b.y[0]));
    const list = [];
    let scanned = 0, found = 0;
    for (let x = b.x[0]; x <= b.x[1]; x += step) {
      for (let z = b.z[0]; z <= b.z[1]; z += step) {
        for (const y of ys) {
          scanned++;
          const s = summonAt(this.pocket, solid, [x, y, z], { r, minSeedGap: this.minSeedGap });
          if (!s.ok) continue;
          if (clear > 0 && !s.con.seeds.every((q) => {
            const n = nearestSeed(this.pocket, q);
            return !n || n.gap >= clear;
          })) continue;
          found++;
          if (list.length < limit) list.push({ solid, r, centre: [x, y, z], con: s.con });
        }
      }
    }
    return { solid, r, step, ys: ys.slice(), clear, scanned, found, list, truncated: found > list.length };
  }

  // ------------------------------------------------------------ the action ---

  /**
   * Plant a constellation. THE move.
   *
   * Returns `{ ok, move, solid, centre, con, pocket, pocketChanged, planted,
   * refusals, first, refusal, placed }` — the SAME KEY SET on all three paths
   * (success, refusal, bad point), so a renderer never has to test whether a
   * field is present. `first` and `refusal` are the same object, `null`
   * together on a success; see the header for why both names exist.
   *
   * Note the one place `first` means something else: `placed.first` is the
   * index of the summon's first seed in the pocket, and it is a level down.
   * On a refusal `placed` is `null`, so the two are never both live.
   *
   * On a refusal `pocket` is the session's pocket
   * UNCHANGED and `pocketChanged` is false — `reformPocketAll` never writes to
   * the pocket it is given, so a refusal is a no-op rather than something that
   * has to be undone, and the gate deep-compares a snapshot to prove it rather
   * than trusting this sentence.
   *
   * `moves` increments on every attempt THAT REACHED THE FOAM — refusals
   * included, since a refused summon is a move the player made. A malformed
   * `point` is the one exception: it never reached the foam, it returns
   * `move: null`, and counting it would corrupt "how many moves did this take".
   */
  place(solid, point, opts = {}) {
    this._started();
    if (!SOLID_NAMES.includes(solid)) {
      throw new Error(`summon-session: unknown solid "${solid}" (have ${SOLID_NAMES.join(', ')})`);
    }
    const r = opts.r ?? this.r;
    const rotate = opts.rotate ?? 0;
    if (badPoint(point)) {
      // A bad argument is not a move — it never reached the foam, and counting
      // it would corrupt "how many moves did the player take".
      const rf = this._attribute({ reason: 'point', at: Array.isArray(point) ? point.slice() : point });
      return {
        ok: false, move: null, solid, centre: null, con: null,
        pocket: this.pocket, pocketChanged: false, planted: [],
        refusals: [rf], first: rf, refusal: rf, placed: null,
      };
    }
    this.moves++;
    const move = this.moves;
    // Built with the POCKET's aniso, never a default: that is what makes a
    // `metric` refusal unreachable here by construction (`placement.mjs` keeps
    // the check for callers who build their own constellation and hand it over).
    const con = constellation(solid, { centre: point, r, rotate, aniso: this.pocket.opts.aniso });
    const t = reformPocketAll(this.pocket, con.seeds);

    if (!t.ok) {
      const refusals = t.refusals.map((x) => this._attribute(x));
      const first = refusals.length ? refusals[0] : null;
      return {
        ok: false, move, solid, centre: con.centre.slice(), con,
        pocket: this.pocket, pocketChanged: false, planted: [],
        refusals, first, refusal: first, placed: null,
      };
    }

    const rec = {
      move, solid, centre: con.centre.slice(), r, rotate,
      first: t.planted[0], count: con.seeds.length,
      planted: t.planted.slice(), seeds: con.seeds.map((s) => s.slice()),
    };
    // Order matters: the pocket is only swapped once the transaction has
    // committed, and `placed` only grows alongside it.
    this.pocket = t.pocket;
    this.placed.push(rec);
    return {
      ok: true, move, solid, centre: rec.centre, con,
      pocket: this.pocket, pocketChanged: true, planted: rec.planted.slice(),
      refusals: [], first: null, refusal: null, placed: rec,
    };
  }
}

/** Convenience: construct and start in one call. */
export function startSession(seed = 1, opts = {}) {
  const s = new SummonSession(opts);
  s.start(seed);
  return s;
}
